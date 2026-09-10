import { render, screen, waitFor } from "@testing-library/react";
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
	await user.type(screen.getByLabelText(/^question$/i), "What is 2 + 2?");
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

	it("titles the create form New Question", () => {
		render(<McqForm mode="create" />);
		expect(
			screen.getByRole("heading", { name: /new question/i }),
		).toBeTruthy();
	});

	it("titles the edit form Edit Question", () => {
		render(<McqForm mode="edit" mcqId="mcq-1" initialMcq={publicMcq} />);
		expect(
			screen.getByRole("heading", { name: /edit question/i }),
		).toBeTruthy();
	});

	it("renders a Question field, A-D choices, and exactly one correct-answer control", () => {
		render(<McqForm mode="create" />);
		expect(screen.getByLabelText(/^question$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice a$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice b$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice c$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^choice d$/i)).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^a$/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /^d$/i })).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /add choice/i }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: /remove choice/i }),
		).toBeNull();
	});

	it("Cancel returns to the dashboard", () => {
		render(<McqForm mode="create" />);
		const cancel = screen.getByRole("link", { name: /^cancel$/i });
		expect(cancel.getAttribute("href")).toBe("/mcqs");
	});

	it("keeps exactly one correct choice selected", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		const a = screen.getByRole("radio", { name: /^a$/i });
		const b = screen.getByRole("radio", { name: /^b$/i });
		await user.click(a);
		expect(a).toHaveProperty("checked", true);
		await user.click(b);
		expect(a).toHaveProperty("checked", false);
		expect(b).toHaveProperty("checked", true);
	});

	it("does not call the create action when required fields are empty", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(createMcqAction).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("does not call the create action when two choices match", async () => {
		const user = userEvent.setup();
		render(<McqForm mode="create" />);
		await user.type(screen.getByLabelText(/^question$/i), "What is 2 + 2?");
		await user.type(screen.getByLabelText(/^choice a$/i), "4");
		await user.type(screen.getByLabelText(/^choice b$/i), "4");
		await user.type(screen.getByLabelText(/^choice c$/i), "5");
		await user.type(screen.getByLabelText(/^choice d$/i), "22");
		await user.click(screen.getByRole("radio", { name: /^b$/i }));
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(createMcqAction).not.toHaveBeenCalled();
	});

	it("shows a saving status while the create action is in flight", async () => {
		const user = userEvent.setup();
		let resolveCreate: (value: {
			ok: true;
			mcq: typeof publicMcq;
		}) => void = () => {};
		createMcqAction.mockReturnValue(
			new Promise((resolve) => {
				resolveCreate = resolve;
			}),
		);
		render(<McqForm mode="create" />);
		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(screen.getByRole("status").textContent).toMatch(/saving/i);
		expect(screen.getByRole("button", { name: /^save$/i })).toHaveProperty(
			"disabled",
			true,
		);
		resolveCreate({ ok: true, mcq: publicMcq });
		await waitFor(() => {
			expect(push).toHaveBeenCalledWith("/mcqs");
		});
	});

	it("creates through the server action then navigates to /mcqs", async () => {
		const user = userEvent.setup();
		createMcqAction.mockResolvedValue({ ok: true, mcq: publicMcq });
		render(<McqForm mode="create" />);
		await fillValidForm(user);
		await user.click(screen.getByRole("button", { name: /^save$/i }));
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
		await user.click(screen.getByRole("button", { name: /^save$/i }));
		expect(await screen.findByText(/validation failed/i)).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("loads an existing question and saves with the update action", async () => {
		const user = userEvent.setup();
		updateMcqAction.mockResolvedValue({ ok: true, mcq: publicMcq });
		render(<McqForm mode="edit" mcqId="mcq-1" initialMcq={publicMcq} />);

		expect(screen.getByDisplayValue("What is 2 + 2?")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: /^save$/i }));
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
