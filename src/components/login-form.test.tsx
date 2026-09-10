import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { LoginForm } from "./login-form";

const PASSWORD = "password1";

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders username and a password field", () => {
		render(<LoginForm />);
		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		const password = screen.getByLabelText(/^password$/i);
		expect(password).toHaveProperty("type", "password");
	});

	it("does not POST when the password is too short", async () => {
		const user = userEvent.setup();
		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), "short");
		await user.click(screen.getByRole("button", { name: /^login$/i }));
		expect(fetch).not.toHaveBeenCalled();
		expect(push).not.toHaveBeenCalled();
	});

	it("hashes the password and POSTs /api/auth/login", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
		);
		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), PASSWORD);
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/auth/login");
		expect(init?.method).toBe("POST");
		const body = JSON.parse(String(init?.body)) as {
			username: string;
			password: string;
		};
		expect(body.username).toBe("ada");
		expect(body.password).toMatch(/^[a-f0-9]{64}$/);
		expect(body.password).not.toBe(PASSWORD);
	});

	it("navigates to /mcqs after a 200", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
		);
		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), PASSWORD);
		await user.click(screen.getByRole("button", { name: /^login$/i }));
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows a generic error on 401 and stays on the form", async () => {
		const user = userEvent.setup();
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({ error: "Invalid username or password" }),
				{ status: 401 },
			),
		);
		render(<LoginForm />);
		await user.type(screen.getByLabelText(/username/i), "ada");
		await user.type(screen.getByLabelText(/^password$/i), PASSWORD);
		await user.click(screen.getByRole("button", { name: /^login$/i }));
		expect(
			await screen.findByText(/invalid username or password/i),
		).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("links to register and has no Google or forgot-password controls", () => {
		render(<LoginForm />);
		const signup = screen.getByRole("link", { name: /sign up/i });
		expect(signup.getAttribute("href")).toBe("/register");
		expect(
			screen.queryByRole("button", { name: /google/i }),
		).toBeNull();
		expect(screen.queryByText(/forgot/i)).toBeNull();
	});
});
