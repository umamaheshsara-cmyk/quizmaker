import { describe, expect, it } from "vitest";
import { sha256Hex } from "./password";

describe("sha256Hex", () => {
	it("returns the same lowercase hex digest for the same plaintext", async () => {
		const first = await sha256Hex("secret-password");
		const second = await sha256Hex("secret-password");
		expect(first).toBe(second);
		expect(first).toBe(first.toLowerCase());
	});

	it("returns 64 hex characters", async () => {
		const digest = await sha256Hex("secret-password");
		expect(digest).toMatch(/^[a-f0-9]{64}$/);
	});

	it("returns different digests for different plaintexts", async () => {
		const first = await sha256Hex("password-one");
		const second = await sha256Hex("password-two");
		expect(first).not.toBe(second);
	});

	it("does not return the plaintext", async () => {
		const plaintext = "secret-password";
		expect(await sha256Hex(plaintext)).not.toBe(plaintext);
	});
});
