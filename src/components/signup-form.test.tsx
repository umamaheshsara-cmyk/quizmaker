import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push } = vi.hoisted(() => ({
	push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push }),
}));

import { SignupForm } from "./signup-form";

const PASSWORD = "password1";

function setupUser() {
	return userEvent.setup({ delay: null });
}

async function fillValidForm(
	user: ReturnType<typeof userEvent.setup>,
	overrides?: { email?: string; confirm?: string; password?: string },
) {
	await user.type(screen.getByLabelText(/first name/i), "Ada");
	await user.type(screen.getByLabelText(/last name/i), "Lovelace");
	await user.type(screen.getByLabelText(/username/i), "ada");
	await user.type(
		screen.getByLabelText(/^email$/i),
		overrides?.email ?? "ada@school.edu",
	);
	await user.type(
		screen.getByLabelText(/^password$/i),
		overrides?.password ?? PASSWORD,
	);
	await user.type(
		screen.getByLabelText(/confirm password/i),
		overrides?.confirm ?? PASSWORD,
	);
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
	});

	it("renders the register fields including confirm password", () => {
		render(<SignupForm />);
		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toHaveProperty(
			"type",
			"password",
		);
		expect(screen.getByLabelText(/confirm password/i)).toHaveProperty(
			"type",
			"password",
		);
	});

	it("does not POST when email is invalid", async () => {
		const user = setupUser();
		render(<SignupForm />);
		await fillValidForm(user, { email: "not-an-email" });
		await user.click(
			screen.getByRole("button", { name: /create account/i }),
		);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("does not POST when confirmation does not match", async () => {
		const user = setupUser();
		render(<SignupForm />);
		await fillValidForm(user, { confirm: "password2" });
		await user.click(
			screen.getByRole("button", { name: /create account/i }),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(await screen.findByText(/do not match/i)).toBeTruthy();
	});

	it("hashes the password and POSTs /api/auth/register without the confirmation", async () => {
		const user = setupUser();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 201 }),
		);
		render(<SignupForm />);
		await fillValidForm(user);
		await user.click(
			screen.getByRole("button", { name: /create account/i }),
		);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
		expect(url).toBe("/api/auth/register");
		expect(init?.method).toBe("POST");
		const body = JSON.parse(String(init?.body)) as Record<string, string>;
		expect(body).toMatchObject({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
		expect(body.password).toMatch(/^[a-f0-9]{64}$/);
		expect(body.password).not.toBe(PASSWORD);
		expect(body).not.toHaveProperty("confirmPassword");
	});

	it("navigates to /mcqs after a 201", async () => {
		const user = setupUser();
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ id: "user-1" }), { status: 201 }),
		);
		render(<SignupForm />);
		await fillValidForm(user);
		await user.click(
			screen.getByRole("button", { name: /create account/i }),
		);
		expect(push).toHaveBeenCalledWith("/mcqs");
	});

	it("shows an error on 409", async () => {
		const user = setupUser();
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({ error: "Username or email already taken" }),
				{ status: 409 },
			),
		);
		render(<SignupForm />);
		await fillValidForm(user);
		await user.click(
			screen.getByRole("button", { name: /create account/i }),
		);
		expect(
			await screen.findByText(/username or email already taken/i),
		).toBeTruthy();
		expect(push).not.toHaveBeenCalled();
	});

	it("links to login and has no Google signup", () => {
		render(<SignupForm />);
		const signin = screen.getByRole("link", { name: /sign in/i });
		expect(signin.getAttribute("href")).toBe("/login");
		expect(
			screen.queryByRole("button", { name: /google/i }),
		).toBeNull();
	});
});
