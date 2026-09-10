import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

const { createMcqAction, updateMcqAction } = vi.hoisted(() => ({
	createMcqAction: vi.fn(),
	updateMcqAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

vi.mock("@/app/mcqs/actions", () => ({
	createMcqAction,
	updateMcqAction,
}));

import { McqForm } from "./mcq-form";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/prompt/i), "What is 2 + 2?");
	await user.type(screen.getByLabelText(/^choice a$/i), "3");
	await user.type(screen.getByLabelText(/^choice b$/i), "4");
	await user.type(screen.getByLabelText(/^choice c$/i), "5");
	await user.type(screen.getByLabelText(/^choice d$/i), "22");
	await user.click(screen.getByRole("radio", { name: /^b$/i }));
}

describe("McqForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders prompt, A-D choices, and a correct-answer control", () => {
		render(<McqForm mode="create" />);
		expect(screen.getByLabelText(/prompt/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice a$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice b$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice c$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice d$/i)).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^a$/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^d$/i })).toBeTruthy();
	});

	it("does not call the create action when required fields are empty", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await user.click(screen.getByRole("button", { name: /save question/i }));
		expect(createMcqAction).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("does not call the create action when two choices match", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await user.type(screen.getByLabelText(/prompt/i), "What is 2 + 2?");
		await user.type(screen.getByLabelText(/^choice a$/i), "4");
		await user.type(screen.getByLabelText(/^choice b$/i), "4");
		await user.type(screen.getByLabelText(/^choice c$/i), "5");
		await user.type(screen.getByLabelText(/^choice d$/i), "22");
		await user.click(screen.getByRole("radio", { name: /^b$/i }));
		await user.click(screen.getByRole("button", { name: /save question/i }));
		expect(createMcqAction).not.toHaveBeenCalled();
	});

	it("creates through the server action then navigates to /mcqs", async () => {
		const user = userEvent.setup();
		createMcqAction.mockResolvedValue({ ok: true, mcq: publicMcq });
		render(<McqForm mode="create" />);
		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: /save question/i }));
		expect(createMcqAction).toHaveBeenCalledWith({
			prompt: "What is 2 + 2?",
			choiceA: "3",
			choiceB: "4",
			choiceC: "5",
			choiceD: "22",
			correct: "B",
		});
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows a validation error from the action and stays on the form", async () => {
		const user = userEvent.setup();
		createMcqAction.mockResolvedValue({
			ok: false,
			error: "Validation failed",
		});
		render(<McqForm mode="create" />);
		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: /save question/i }));
		expect(await screen.findByText(/validation failed/i)).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("loads an existing question and saves with the update action", async () => {
		const user = userEvent.setup();
		updateMcqAction.mockResolvedValue({ ok: true, mcq: publicMcq });
		render(<McqForm mode="edit" mcqId="mcq-1" initialMcq={publicMcq} />);

		expect(screen.getByDisplayValue("What is 2 + 2?")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: /save question/i }));
		expect(updateMcqAction).toHaveBeenCalledWith("mcq-1", {
			prompt: "What is 2 + 2?",
			choiceA: "3",
			choiceB: "4",
			choiceC: "5",
			choiceD: "22",
			correct: "B",
		});
		expect(createMcqAction).not.toHaveBeenCalled();
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows not-found when the edit load fails", () => {
		render(
			<McqForm
				mode="edit"
				mcqId="missing"
				initialError="Question not found"
			/>,
		);
		expect(screen.getByText(/question not found/i)).toBeTruthy();
		expect(
			screen.getByRole("link", { name: /back to questions/i }),
		).toBeTruthy();
	});
});
