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

const { listMcqsAction, deleteMcqAction } = vi.hoisted(() => ({
	listMcqsAction: vi.fn(),
	deleteMcqAction: vi.fn(),
}));

vi.mock("@/app/mcqs/actions", () => ({
	listMcqsAction,
	deleteMcqAction,
}));

import { McqList } from "./mcq-list";

describe("McqList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders rows from a successful list action", async () => {
		render(<McqList initialMcqs={[publicMcq]} />);
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		expect(screen.getByText("B")).toBeTruthy();
	});

	it("shows an empty state when the bank has no questions", () => {
		render(<McqList initialMcqs={[]} />);
		expect(
			screen.getByText(/no questions in the shared bank yet/i),
		).toBeTruthy();
		expect(screen.queryByRole("table")).toBeNull();
	});

	it("links Create Question to /mcqs/new", () => {
		render(<McqList initialMcqs={[]} />);
		const add = screen.getByRole("link", { name: /create question/i });
		expect(add.getAttribute("href")).toBe("/mcqs/new");
	});

	it("links Edit to /mcqs/[id]/edit", () => {
		render(<McqList initialMcqs={[publicMcq]} />);
		const edit = screen.getByRole("link", { name: /edit/i });
		expect(edit.getAttribute("href")).toBe("/mcqs/mcq-1/edit");
	});

	it("links Preview to /mcqs/[id]", () => {
		render(<McqList initialMcqs={[publicMcq]} />);
		const preview = screen.getByRole("link", { name: /preview/i });
		expect(preview.getAttribute("href")).toBe("/mcqs/mcq-1");
	});

	it("shows a loading status while the list is refreshing", async () => {
		const user = userEvent.setup();
		let resolveList: (value: { ok: true; mcqs: [] }) => void = () => {};
		listMcqsAction.mockReturnValue(
			new Promise((resolve) => {
				resolveList = resolve;
			}),
		);
		deleteMcqAction.mockResolvedValue({ ok: true });

		render(<McqList initialMcqs={[publicMcq]} />);
		await user.click(screen.getByRole("button", { name: /^delete$/i }));
		await user.click(
			await screen.findByRole("button", { name: /delete question/i }),
		);

		expect(screen.getByRole("status").textContent).toMatch(/loading/i);
		resolveList({ ok: true, mcqs: [] });
		expect(
			await screen.findByText(/no questions in the shared bank yet/i),
		).toBeTruthy();
	});

	it("confirms then deletes and removes the row", async () => {
		const user = userEvent.setup();
		listMcqsAction.mockResolvedValue({ ok: true, mcqs: [] });
		deleteMcqAction.mockResolvedValue({ ok: true });

		render(<McqList initialMcqs={[publicMcq]} />);
		expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: /delete/i }));
		await user.click(
			await screen.findByRole("button", { name: /delete question/i }),
		);

		expect(deleteMcqAction).toHaveBeenCalledWith("mcq-1");
		expect(
			await screen.findByText(/no questions in the shared bank yet/i),
		).toBeTruthy();
	});

	it("shows an error when listing fails", () => {
		render(
			<McqList initialMcqs={[]} initialError="Server error" />,
		);
		expect(screen.getByText(/server error/i)).toBeTruthy();
	});
});
