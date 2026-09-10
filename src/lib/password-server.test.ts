import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashPassword, verifyPassword } from "./password-server";

const DIGEST = "c".repeat(64);

describe("hashPassword / verifyPassword", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns hex salt and hash that are not the input digest", async () => {
		const { salt, hash } = await hashPassword(DIGEST);
		expect(salt).toMatch(/^[a-f0-9]+$/);
		expect(hash).toMatch(/^[a-f0-9]+$/);
		expect(salt).not.toBe(DIGEST);
		expect(hash).not.toBe(DIGEST);
	});

	it("produces different salts and hashes for the same digest", async () => {
		const first = await hashPassword(DIGEST);
		const second = await hashPassword(DIGEST);
		expect(first.salt).not.toBe(second.salt);
		expect(first.hash).not.toBe(second.hash);
	});

	it("verifies a matching digest against the stored salt and hash", async () => {
		const { salt, hash } = await hashPassword(DIGEST);
		await expect(verifyPassword(DIGEST, salt, hash)).resolves.toBe(true);
	});

	it("rejects a wrong digest", async () => {
		const { salt, hash } = await hashPassword(DIGEST);
		await expect(verifyPassword("d".repeat(64), salt, hash)).resolves.toBe(
			false,
		);
	});

	it("rejects a tampered salt or hash", async () => {
		const { salt, hash } = await hashPassword(DIGEST);
		const flip = (hex: string) =>
			`${hex.slice(0, -1)}${hex.endsWith("0") ? "1" : "0"}`;

		await expect(verifyPassword(DIGEST, flip(salt), hash)).resolves.toBe(
			false,
		);
		await expect(verifyPassword(DIGEST, salt, flip(hash))).resolves.toBe(
			false,
		);
	});
});
