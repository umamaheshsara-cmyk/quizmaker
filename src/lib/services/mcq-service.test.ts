import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

type McqRow = {
	id: string;
	prompt: string;
	choice_a: string;
	choice_b: string;
	choice_c: string;
	choice_d: string;
	correct: string;
	created_at: string;
	updated_at: string;
};

const { memory } = vi.hoisted(() => {
	const rows: McqRow[] = [];
	const statements: { sql: string; params: unknown[] }[] = [];
	let clock = 0;

	function nextTimestamp() {
		clock += 1;
		return `2026-09-10 12:00:${String(clock).padStart(2, "0")}`;
	}

	const DB = {
		prepare(sql: string) {
			const normalized = sql.replace(/\s+/g, " ").trim();
			return {
				bind(...params: unknown[]) {
					statements.push({ sql: normalized, params: [...params] });
					return {
						async all() {
							if (/^INSERT INTO mcqs/i.test(normalized)) {
								const [
									id,
									prompt,
									choice_a,
									choice_b,
									choice_c,
									choice_d,
									correct,
								] = params as string[];
								const timestamp = nextTimestamp();
								rows.push({
									id,
									prompt,
									choice_a,
									choice_b,
									choice_c,
									choice_d,
									correct,
									created_at: timestamp,
									updated_at: timestamp,
								});
								return { results: [] };
							}

							if (
								/^SELECT .+ FROM mcqs WHERE id = \?1/i.test(normalized)
							) {
								const row = rows.find((item) => item.id === params[0]);
								return { results: row ? [row] : [] };
							}

							if (
								/^SELECT .+ FROM mcqs ORDER BY created_at DESC/i.test(
									normalized,
								)
							) {
								const sorted = [...rows].sort((a, b) =>
									a.created_at < b.created_at ? 1 : -1,
								);
								return { results: sorted };
							}

							if (/^UPDATE mcqs SET/i.test(normalized)) {
								const [
									prompt,
									choice_a,
									choice_b,
									choice_c,
									choice_d,
									correct,
									id,
								] = params as string[];
								const row = rows.find((item) => item.id === id);
								if (!row) {
									return { results: [] };
								}
								row.prompt = prompt;
								row.choice_a = choice_a;
								row.choice_b = choice_b;
								row.choice_c = choice_c;
								row.choice_d = choice_d;
								row.correct = correct;
								row.updated_at = nextTimestamp();
								return { results: [] };
							}

							if (/^DELETE FROM mcqs WHERE id = \?1/i.test(normalized)) {
								const index = rows.findIndex(
									(item) => item.id === params[0],
								);
								if (index >= 0) {
									rows.splice(index, 1);
								}
								return { results: [] };
							}

							throw new Error(`Unhandled SQL in mock: ${normalized}`);
						},
					};
				},
			};
		},
	};

	return {
		memory: {
			rows,
			statements,
			DB,
			reset() {
				rows.length = 0;
				statements.length = 0;
				clock = 0;
			},
		},
	};
});

vi.mock("server-only", () => ({}));

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: memory.DB },
	})),
}));

import {
	McqNotFoundError,
	createMcq,
	deleteMcq,
	getMcqById,
	listMcqs,
	updateMcq,
} from "./mcq-service";

const sample = {
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
	correct: "B" as const,
};

describe("mcq service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		memory.reset();
	});

	it("createMcq returns a public MCQ with id, prompt, ordered choices, correct, and timestamps", async () => {
		const created = await createMcq(sample);
		expect(created.id).toEqual(expect.any(String));
		expect(created.id.length).toBeGreaterThan(0);
		expect(created).toMatchObject({
			prompt: "What is 2 + 2?",
			choiceA: "3",
			choiceB: "4",
			choiceC: "5",
			choiceD: "22",
			correct: "B",
		});
		expect(created.createdAt).toEqual(expect.any(String));
		expect(created.updatedAt).toEqual(expect.any(String));
		expect(created.createdAt.length).toBeGreaterThan(0);
		expect(created).not.toHaveProperty("choice_a");
		expect(created).not.toHaveProperty("ownerId");
		expect(created).not.toHaveProperty("userId");
	});

	it("createMcq rejects a blank prompt, blank choice, or correct outside A-D", async () => {
		await expect(createMcq({ ...sample, prompt: "   " })).rejects.toBeInstanceOf(
			ZodError,
		);
		await expect(createMcq({ ...sample, choiceC: "" })).rejects.toBeInstanceOf(
			ZodError,
		);
		await expect(
			createMcq({ ...sample, correct: "E" as "A" }),
		).rejects.toBeInstanceOf(ZodError);
	});

	it("createMcq rejects when two choices share the same trimmed text", async () => {
		await expect(
			createMcq({ ...sample, choiceA: " four ", choiceB: "four" }),
		).rejects.toBeInstanceOf(ZodError);
	});

	it("inserts with numbered placeholders and bound UUID plus fields", async () => {
		const created = await createMcq(sample);
		const insert = memory.statements.find((statement) =>
			/^INSERT INTO mcqs/i.test(statement.sql),
		);
		expect(insert).toBeDefined();
		expect(insert?.sql).toMatch(/\?1/);
		expect(insert?.sql).toMatch(/\?2/);
		expect(insert?.sql).toMatch(/\?7/);
		expect(insert?.sql).not.toContain("What is 2 + 2?");
		expect(insert?.params[0]).toBe(created.id);
		expect(insert?.params.slice(1)).toEqual([
			"What is 2 + 2?",
			"3",
			"4",
			"5",
			"22",
			"B",
		]);
	});

	it("listMcqs returns an empty array when the bank is empty", async () => {
		await expect(listMcqs()).resolves.toEqual([]);
	});

	it("listMcqs returns created rows newest first", async () => {
		const older = await createMcq(sample);
		const newer = await createMcq({
			...sample,
			prompt: "What is 3 + 3?",
			choiceB: "6",
		});
		const listed = await listMcqs();
		expect(listed.map((item) => item.id)).toEqual([newer.id, older.id]);
	});

	it("getMcqById returns the MCQ when present and null when missing", async () => {
		const created = await createMcq(sample);
		await expect(getMcqById(created.id)).resolves.toEqual(created);
		await expect(getMcqById("missing-id")).resolves.toBeNull();
	});

	it("updateMcq changes prompt, choices, and correct", async () => {
		const created = await createMcq(sample);
		const updated = await updateMcq(created.id, {
			prompt: "What is 9 + 1?",
			choiceA: "8",
			choiceB: "9",
			choiceC: "10",
			choiceD: "11",
			correct: "C",
		});
		expect(updated).toMatchObject({
			id: created.id,
			prompt: "What is 9 + 1?",
			choiceA: "8",
			choiceB: "9",
			choiceC: "10",
			choiceD: "11",
			correct: "C",
		});
		expect(updated.createdAt).toBe(created.createdAt);
		expect(updated.updatedAt).not.toBe(created.updatedAt);
	});

	it("updateMcq throws McqNotFoundError when the id is missing", async () => {
		await expect(updateMcq("missing-id", sample)).rejects.toBeInstanceOf(
			McqNotFoundError,
		);
	});

	it("deleteMcq removes the row so a later get returns null", async () => {
		const created = await createMcq(sample);
		await deleteMcq(created.id);
		await expect(getMcqById(created.id)).resolves.toBeNull();
		await expect(listMcqs()).resolves.toEqual([]);
	});

	it("deleteMcq throws McqNotFoundError when the id is missing", async () => {
		await expect(deleteMcq("missing-id")).rejects.toBeInstanceOf(
			McqNotFoundError,
		);
	});
});
