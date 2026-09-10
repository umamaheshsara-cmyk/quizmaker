import { beforeEach, describe, expect, it, vi } from "vitest";

const publicUser = {
	id: "user-1",
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
};

const INVALID_CREDENTIALS = "Invalid username or password";

const { authenticateUser } = vi.hoisted(() => ({
	authenticateUser: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	authenticateUser,
}));

import { POST } from "./route";

const PASSWORD = "c".repeat(64);

function post(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/login", {
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

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and a public user for valid credentials", async () => {
		authenticateUser.mockResolvedValue(publicUser);

		const response = await post({ username: "ada", password: PASSWORD });
		expect(response.status).toBe(200);

		const payload = await response.json();
		expect(payload).toEqual(publicUser);
		expectNoPasswordFields(payload);
		expect(authenticateUser).toHaveBeenCalledWith("ada", PASSWORD);
	});

	it("returns 400 when fields are missing", async () => {
		const response = await post({});
		expect(response.status).toBe(400);
		expect(authenticateUser).not.toHaveBeenCalled();
	});

	it("returns 401 with a generic message for an unknown user", async () => {
		authenticateUser.mockResolvedValue(null);

		const response = await post({ username: "missing", password: PASSWORD });
		expect(response.status).toBe(401);
		const payload = await response.json();
		expect(payload).toEqual({ error: INVALID_CREDENTIALS });
		expectNoPasswordFields(payload);
	});

	it("returns 401 with the same generic message for a wrong password", async () => {
		authenticateUser.mockResolvedValue(null);

		const response = await post({
			username: "ada",
			password: "d".repeat(64),
		});
		expect(response.status).toBe(401);
		const payload = await response.json();
		expect(payload).toEqual({ error: INVALID_CREDENTIALS });
		expectNoPasswordFields(payload);
	});
});
