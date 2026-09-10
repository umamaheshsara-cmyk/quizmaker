import { beforeEach, describe, expect, it, vi } from "vitest";

type McqRow = {
	id: string;
	correct: "A" | "B" | "C" | "D";
};

type AttemptRow = {
	id: string;
	mcq_id: string;
	selected: string;
	is_correct: number;
	created_at: string;
};

const { memory } = vi.hoisted(() => {
	const mcqs: McqRow[] = [];
	const attempts: AttemptRow[] = [];
	const statements: { sql: string; params: unknown[] }[] = [];

	const DB = {
		prepare(sql: string) {
			const normalized = sql.replace(/\s+/g, " ").trim();
			return {
				bind(...params: unknown[]) {
					statements.push({ sql: normalized, params: [...params] });
					return {
						async all() {
							if (
								/^SELECT correct FROM mcqs WHERE id = \?1/i.test(
									normalized,
								)
							) {
								const row = mcqs.find((item) => item.id === params[0]);
								return { results: row ? [row] : [] };
							}

							if (/^INSERT INTO attempts/i.test(normalized)) {
								const [id, mcq_id, selected, is_correct] = params as [
									string,
									string,
									string,
									number,
								];
								attempts.push({
									id,
									mcq_id,
									selected,
									is_correct,
									created_at: "2026-09-10 12:00:01",
								});
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
			mcqs,
			attempts,
			statements,
			DB,
			reset() {
				mcqs.length = 0;
				attempts.length = 0;
				statements.length = 0;
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

import { McqNotFoundError } from "@/lib/services/mcq-service";
import { submitAttempt } from "./attempt-service";

describe("attempt-service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		memory.reset();
		memory.mcqs.push({ id: "mcq-1", correct: "B" });
	});

	it("records a correct attempt from the stored letter, not a client flag", async () => {
		const result = await submitAttempt("mcq-1", "B");
		expect(result.isCorrect).toBe(true);
		expect(result.correct).toBe("B");
		expect(memory.attempts).toHaveLength(1);
		expect(memory.attempts[0]?.selected).toBe("B");
		expect(memory.attempts[0]?.is_correct).toBe(1);
		expect(memory.attempts[0]?.mcq_id).toBe("mcq-1");
	});

	it("records an incorrect attempt and still returns the server correct letter", async () => {
		const result = await submitAttempt("mcq-1", "A");
		expect(result.isCorrect).toBe(false);
		expect(result.correct).toBe("B");
		expect(memory.attempts[0]?.is_correct).toBe(0);
	});

	it("throws Question not found when the MCQ is missing", async () => {
		await expect(submitAttempt("missing", "A")).rejects.toBeInstanceOf(
			McqNotFoundError,
		);
		expect(memory.attempts).toHaveLength(0);
	});
});
