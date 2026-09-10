import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const attemptMcq = {
	id: "mcq-1",
	prompt: "What is 2 + 2?",
	choiceA: "3",
	choiceB: "4",
	choiceC: "5",
	choiceD: "22",
};

const { submitAttemptAction } = vi.hoisted(() => ({
	submitAttemptAction: vi.fn(),
}));

vi.mock("@/app/mcqs/actions", () => ({
	submitAttemptAction,
}));

import { McqAttempt } from "./mcq-attempt";

describe("McqAttempt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows the question and choices without the correct letter", () => {
		render(<McqAttempt mcq={attemptMcq} />);
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByRole("radio", { name: /a\.\s*3/i })).toBeTruthy();
		expect(screen.getByRole("radio", { name: /b\.\s*4/i })).toBeTruthy();
		expect(screen.queryByText(/^correct$/i)).toBeNull();
		expect(screen.queryByText(/^incorrect$/i)).toBeNull();
	});

	it("does not submit until a choice is selected", async () => {
		const user = userEvent.setup();
		render(<McqAttempt mcq={attemptMcq} />);
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		expect(submitAttemptAction).not.toHaveBeenCalled();
		expect(screen.getByText(/select an answer/i)).toBeTruthy();
	});

	it("submits only the id and selected letter", async () => {
		const user = userEvent.setup();
		submitAttemptAction.mockResolvedValue({
			ok: true,
			isCorrect: true,
			correct: "B",
		});
		render(<McqAttempt mcq={attemptMcq} />);
		await user.click(screen.getByRole("radio", { name: /b\.\s*4/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		expect(submitAttemptAction).toHaveBeenCalledWith("mcq-1", "B");
		expect(submitAttemptAction.mock.calls[0]?.[2]).toBeUndefined();
		expect(await screen.findByText(/^correct$/i)).toBeTruthy();
	});

	it("shows incorrect feedback from the server result", async () => {
		const user = userEvent.setup();
		submitAttemptAction.mockResolvedValue({
			ok: true,
			isCorrect: false,
			correct: "B",
		});
		render(<McqAttempt mcq={attemptMcq} />);
		await user.click(screen.getByRole("radio", { name: /a\.\s*3/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		expect(await screen.findByText(/^incorrect$/i)).toBeTruthy();
		expect(screen.getByText(/correct answer is b/i)).toBeTruthy();
	});

	it("Try Again clears feedback so another attempt can be submitted", async () => {
		const user = userEvent.setup();
		submitAttemptAction.mockResolvedValue({
			ok: true,
			isCorrect: false,
			correct: "B",
		});
		render(<McqAttempt mcq={attemptMcq} />);
		await user.click(screen.getByRole("radio", { name: /a\.\s*3/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		await screen.findByText(/^incorrect$/i);
		await user.click(screen.getByRole("button", { name: /try again/i }));
		expect(screen.queryByText(/^incorrect$/i)).toBeNull();
		expect(screen.getByRole("radio", { name: /a\.\s*3/i })).toHaveProperty(
			"checked",
			false,
		);
	});

	it("Back returns to the dashboard", () => {
		render(<McqAttempt mcq={attemptMcq} />);
		const back = screen.getByRole("link", { name: /^back$/i });
		expect(back.getAttribute("href")).toBe("/mcqs");
	});

	it("shows a loading status while grading", async () => {
		const user = userEvent.setup();
		let resolveGrade: (value: {
			ok: true;
			isCorrect: true;
			correct: "B";
		}) => void = () => {};
		submitAttemptAction.mockReturnValue(
			new Promise((resolve) => {
				resolveGrade = resolve;
			}),
		);
		render(<McqAttempt mcq={attemptMcq} />);
		await user.click(screen.getByRole("radio", { name: /b\.\s*4/i }));
		await user.click(screen.getByRole("button", { name: /^submit$/i }));
		expect(screen.getByRole("status").textContent).toMatch(/checking/i);
		resolveGrade({ ok: true, isCorrect: true, correct: "B" });
		expect(await screen.findByText(/^correct$/i)).toBeTruthy();
	});

	it("shows a load error with a way back", () => {
		render(<McqAttempt mcq={null} initialError="Question not found" />);
		expect(screen.getByText(/question not found/i)).toBeTruthy();
		expect(screen.getByRole("link", { name: /back/i })).toBeTruthy();
	});
});
