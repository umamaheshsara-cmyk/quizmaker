import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { LogoutButton } from "./logout-button";

describe("LogoutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("POSTs /api/auth/logout then navigates to /login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);
		render(<LogoutButton />);
		await user.click(screen.getByRole("button", { name: /logout/i }));
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/logout",
			expect.objectContaining({ method: "POST" }),
		);
		expect(push).toHaveBeenCalledWith("/login");
	});
});
