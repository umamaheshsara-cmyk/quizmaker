import { beforeEach, describe, expect, it, vi } from "vitest";

const publicMcq = {
	id: "mcq-1",
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
	correct: "B",
	createdAt: "2026-09-10 12:00:01",
	updatedAt: "2026-09-10 12:00:01",
};

const validBody = {
	prompt: "What is 9 + 1?",
	choiceA: "8",
	choiceB: "9",
	choiceC: "10",
	choiceD: "11",
	correct: "C",
};

const { getMcqById, updateMcq, deleteMcq, McqNotFoundError } = vi.hoisted(
	() => {
		class McqNotFoundError extends Error {
			constructor(message = "Question not found") {
				super(message);
				this.name = "McqNotFoundError";
			}
		}

		return {
			getMcqById: vi.fn(),
			updateMcq: vi.fn(),
			deleteMcq: vi.fn(),
			McqNotFoundError,
		};
	},
);

vi.mock("@/lib/services/mcq-service", () => ({
	getMcqById,
	updateMcq,
	deleteMcq,
	McqNotFoundError,
}));

import { DELETE, GET, PUT } from "./route";

function context(id: string) {
	return { params: Promise.resolve({ id }) };
}

function get(id: string) {
	return GET(
		new Request(`http://localhost/api/mcqs/${id}`),
		context(id),
	);
}

function put(id: string, body: unknown, raw?: string) {
	return PUT(
		new Request(`http://localhost/api/mcqs/${id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: raw ?? JSON.stringify(body),
		}),
		context(id),
	);
}

function del(id: string) {
	return DELETE(
		new Request(`http://localhost/api/mcqs/${id}`, { method: "DELETE" }),
		context(id),
	);
}

describe("GET /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and the public MCQ when it exists", async () => {
		getMcqById.mockResolvedValue(publicMcq);

		const response = await get("mcq-1");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(publicMcq);
		expect(getMcqById).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 Question not found when the id is missing", async () => {
		getMcqById.mockResolvedValue(null);

		const response = await get("missing-id");
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});
});

describe("PUT /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and the updated public MCQ", async () => {
		updateMcq.mockResolvedValue({ ...publicMcq, ...validBody });

		const response = await put("mcq-1", validBody);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject(validBody);
		expect(updateMcq).toHaveBeenCalledWith("mcq-1", validBody);
	});

	it("returns 400 when the body is invalid", async () => {
		const response = await put("mcq-1", { ...validBody, correct: "E" });
		expect(response.status).toBe(400);
		expect(updateMcq).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid JSON", async () => {
		const response = await put("mcq-1", null, "{not-json");
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid JSON",
		});
		expect(updateMcq).not.toHaveBeenCalled();
	});

	it("returns 404 when the id is missing", async () => {
		updateMcq.mockRejectedValue(new McqNotFoundError());

		const response = await put("missing-id", validBody);
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
	});
});

describe("DELETE /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 { ok: true } when the row is deleted", async () => {
		deleteMcq.mockResolvedValue(undefined);

		const response = await del("mcq-1");
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(deleteMcq).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the id is missing", async () => {
		deleteMcq.mockRejectedValue(new McqNotFoundError());

		const response = await del("missing-id");
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({
			error: "Question not found",
		});
		expect(deleteMcq).toHaveBeenCalledWith("missing-id");
	});
});
