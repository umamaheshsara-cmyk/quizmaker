import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUser, updateUser, deleteUser } = vi.hoisted(() => ({
	createUser: vi.fn(),
	updateUser: vi.fn(),
	deleteUser: vi.fn(),
}));

vi.mock("@/lib/services/user-service", () => ({
	createUser,
	updateUser,
	deleteUser,
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and { ok: true }", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it("does not call user-service write methods", async () => {
		await POST(
			new Request("http://localhost/api/auth/logout", { method: "POST" }),
		);
		expect(createUser).not.toHaveBeenCalled();
		expect(updateUser).not.toHaveBeenCalled();
		expect(deleteUser).not.toHaveBeenCalled();
	});
});
