import { beforeEach, describe, expect, it, vi } from "vitest";

const publicMcq = {
	id: "mcq-1",
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
	correct: "B" as const,
	createdAt: "2026-09-10 12:00:01",
	updatedAt: "2026-09-10 12:00:01",
};

const validInput = {
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
	correct: "B" as const,
};

const {
	createMcq,
	listMcqs,
	getMcqById,
	updateMcq,
	deleteMcq,
	McqNotFoundError,
} = vi.hoisted(() => {
	class McqNotFoundError extends Error {
		constructor(message = "Question not found") {
			super(message);
			this.name = "McqNotFoundError";
		}
	}

	return {
		createMcq: vi.fn(),
		listMcqs: vi.fn(),
		getMcqById: vi.fn(),
		updateMcq: vi.fn(),
		deleteMcq: vi.fn(),
		McqNotFoundError,
	};
});

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
}));

vi.mock("@/lib/services/mcq-service", () => ({
	createMcq,
	listMcqs,
	getMcqById,
	updateMcq,
	deleteMcq,
	McqNotFoundError,
}));

import { revalidatePath } from "next/cache";
import {
	createMcqAction,
	deleteMcqAction,
	getMcqAction,
	listMcqsAction,
	updateMcqAction,
} from "./actions";

describe("MCQ server actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("createMcqAction returns the public MCQ and does not take an owner id", async () => {
		createMcq.mockResolvedValue(publicMcq);

		const result = await createMcqAction(validInput);
		expect(result).toEqual({ ok: true, mcq: publicMcq });
		expect(createMcq).toHaveBeenCalledWith(validInput);
		expect(createMcq.mock.calls[0]?.[0]).not.toHaveProperty("ownerId");
		expect(createMcq.mock.calls[0]?.[0]).not.toHaveProperty("userId");
		expect(revalidatePath).toHaveBeenCalledWith("/mcqs");
	});

	it("createMcqAction returns Validation failed and skips the service for a bad body", async () => {
		const result = await createMcqAction({ ...validInput, correct: "E" });
		expect(result).toEqual({ ok: false, error: "Validation failed" });
		expect(createMcq).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
	});

	it("createMcqAction rejects duplicate choice texts", async () => {
		const result = await createMcqAction({
			...validInput,
			choiceA: "four",
			choiceB: "four",
		});
		expect(result).toEqual({ ok: false, error: "Validation failed" });
		expect(createMcq).not.toHaveBeenCalled();
	});

	it("createMcqAction returns Server error when the service throws", async () => {
		createMcq.mockRejectedValue(new Error("boom"));
		const result = await createMcqAction(validInput);
		expect(result).toEqual({ ok: false, error: "Server error" });
	});

	it("listMcqsAction returns mcqs including an empty list", async () => {
		listMcqs.mockResolvedValue([]);
		await expect(listMcqsAction()).resolves.toEqual({ ok: true, mcqs: [] });

		listMcqs.mockResolvedValue([publicMcq]);
		await expect(listMcqsAction()).resolves.toEqual({
			ok: true,
			mcqs: [publicMcq],
		});
	});

	it("listMcqsAction returns Server error when listing fails", async () => {
		listMcqs.mockRejectedValue(new Error("boom"));
		await expect(listMcqsAction()).resolves.toEqual({
			ok: false,
			error: "Server error",
		});
	});

	it("getMcqAction returns the MCQ when present", async () => {
		getMcqById.mockResolvedValue(publicMcq);
		await expect(getMcqAction("mcq-1")).resolves.toEqual({
			ok: true,
			mcq: publicMcq,
		});
		expect(getMcqById).toHaveBeenCalledWith("mcq-1");
	});

	it("getMcqAction returns Question not found when missing", async () => {
		getMcqById.mockResolvedValue(null);
		await expect(getMcqAction("missing")).resolves.toEqual({
			ok: false,
			error: "Question not found",
		});
	});

	it("getMcqAction returns Validation failed for a blank id", async () => {
		await expect(getMcqAction("   ")).resolves.toEqual({
			ok: false,
			error: "Validation failed",
		});
		expect(getMcqById).not.toHaveBeenCalled();
	});

	it("updateMcqAction replaces A-D and correct through the service", async () => {
		const updated = { ...publicMcq, ...validInput, prompt: "What is 9 + 1?" };
		updateMcq.mockResolvedValue(updated);
		const result = await updateMcqAction("mcq-1", {
			...validInput,
			prompt: "What is 9 + 1?",
		});
		expect(result).toEqual({ ok: true, mcq: updated });
		expect(updateMcq).toHaveBeenCalledWith("mcq-1", {
			...validInput,
			prompt: "What is 9 + 1?",
		});
		expect(revalidatePath).toHaveBeenCalledWith("/mcqs");
	});

	it("updateMcqAction maps McqNotFoundError to Question not found", async () => {
		updateMcq.mockRejectedValue(new McqNotFoundError());
		await expect(updateMcqAction("missing", validInput)).resolves.toEqual({
			ok: false,
			error: "Question not found",
		});
	});

	it("deleteMcqAction returns { ok: true } and revalidates", async () => {
		deleteMcq.mockResolvedValue(undefined);
		await expect(deleteMcqAction("mcq-1")).resolves.toEqual({ ok: true });
		expect(deleteMcq).toHaveBeenCalledWith("mcq-1");
		expect(revalidatePath).toHaveBeenCalledWith("/mcqs");
	});

	it("deleteMcqAction maps a missing row to Question not found", async () => {
		deleteMcq.mockRejectedValue(new McqNotFoundError());
		await expect(deleteMcqAction("missing")).resolves.toEqual({
			ok: false,
			error: "Question not found",
		});
	});
});
