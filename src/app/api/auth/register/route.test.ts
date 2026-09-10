import { beforeEach, describe, expect, it, vi } from "vitest";

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

const { createUser, UserConflictError } = vi.hoisted(() => {
	class UserConflictError extends Error {
		constructor(message = "Username or email already taken") {
			super(message);
			this.name = "UserConflictError";
		}
	}

	return {
		createUser: vi.fn(),
		UserConflictError,
	};
});

vi.mock("@/lib/services/user-service", () => ({
	createUser,
	UserConflictError,
}));

import { POST } from "./route";

const PASSWORD = "c".repeat(64);

const validBody = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	password: PASSWORD,
};

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

function expectNoPasswordFields(payload: unknown) {
	expect(payload).not.toHaveProperty("password");
	expect(payload).not.toHaveProperty("password_hash");
	expect(payload).not.toHaveProperty("password_salt");
	expect(payload).not.toHaveProperty("passwordHash");
	expect(payload).not.toHaveProperty("passwordSalt");
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and a public user for a valid body", async () => {
		createUser.mockResolvedValue(publicUser);

		const response = await post(validBody);
		expect(response.status).toBe(201);

		const payload = await response.json();
		expect(payload).toEqual(publicUser);
		expectNoPasswordFields(payload);
		expect(createUser).toHaveBeenCalledWith({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
			passwordSha256: PASSWORD,
		});
	});

	it("returns 400 when required fields are missing", async () => {
		const response = await post({});
		expect(response.status).toBe(400);
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 400 for an invalid email", async () => {
		const response = await post({ ...validBody, email: "not-an-email" });
		expect(response.status).toBe(400);
		expect(createUser).not.toHaveBeenCalled();
	});

	it("returns 409 when the username or email is already taken", async () => {
		createUser.mockRejectedValue(new UserConflictError());

		const response = await post(validBody);
		expect(response.status).toBe(409);
		const payload = await response.json();
		expect(payload).toMatchObject({ error: expect.any(String) });
		expectNoPasswordFields(payload);
	});
});
