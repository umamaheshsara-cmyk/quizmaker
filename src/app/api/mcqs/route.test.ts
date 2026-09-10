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
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
	correct: "B",
};

const { createMcq, listMcqs } = vi.hoisted(() => ({
	createMcq: vi.fn(),
	listMcqs: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	createMcq,
	listMcqs,
}));

import { GET, POST } from "./route";

function post(body: unknown, raw?: string) {
	return POST(
		new Request("http://localhost/api/mcqs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: raw ?? JSON.stringify(body),
		}),
	);
}

describe("GET /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and { mcqs } for a populated list", async () => {
		listMcqs.mockResolvedValue([publicMcq]);

		const response = await GET();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ mcqs: [publicMcq] });
		expect(listMcqs).toHaveBeenCalledOnce();
	});

	it("returns 200 and an empty mcqs array when the bank is empty", async () => {
		listMcqs.mockResolvedValue([]);

		const response = await GET();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ mcqs: [] });
	});

	it("returns 500 when listing fails", async () => {
		listMcqs.mockRejectedValue(new Error("boom"));

		const response = await GET();
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: "Server error" });
	});
});

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and a public MCQ for a valid body", async () => {
		createMcq.mockResolvedValue(publicMcq);

		const response = await post(validBody);
		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual(publicMcq);
		expect(createMcq).toHaveBeenCalledWith(validBody);
	});

	it("returns 400 when required fields are missing", async () => {
		const response = await post({});
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Validation failed",
		});
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when correct is not A-D", async () => {
		const response = await post({ ...validBody, correct: "E" });
		expect(response.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 when two choices share the same text", async () => {
		const response = await post({
			...validBody,
			choiceA: "four",
			choiceB: "four",
		});
		expect(response.status).toBe(400);
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid JSON", async () => {
		const response = await post(null, "{not-json");
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: "Invalid JSON",
		});
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("returns 500 when createMcq throws an unexpected error", async () => {
		createMcq.mockRejectedValue(new Error("boom"));

		const response = await post(validBody);
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({ error: "Server error" });
	});
});
