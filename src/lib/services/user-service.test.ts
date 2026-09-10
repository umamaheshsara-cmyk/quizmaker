import { beforeEach, describe, expect, it, vi } from "vitest";

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	password_salt: string;
};

const { memory } = vi.hoisted(() => {
	const users: UserRow[] = [];
	const inserts: unknown[][] = [];

	function uniqueError(column: string) {
		return new Error(`UNIQUE constraint failed: users.${column}`);
	}

	const DB = {
		prepare(sql: string) {
			const normalized = sql.replace(/\s+/g, " ").trim();
			return {
				bind(...params: unknown[]) {
					return {
						async all() {
							if (/^INSERT INTO users/i.test(normalized)) {
								inserts.push(params);
								const [
									id,
									first_name,
									last_name,
									username,
									email,
									password_hash,
									password_salt,
								] = params as string[];

								if (users.some((user) => user.username === username)) {
									throw uniqueError("username");
								}
								if (users.some((user) => user.email === email)) {
									throw uniqueError("email");
								}

								users.push({
									id,
									first_name,
									last_name,
									username,
									email,
									password_hash,
									password_salt,
								});
								return { results: [] };
							}

							if (/^SELECT .+ FROM users WHERE username = \?1/i.test(normalized)) {
								const row = users.find(
									(user) => user.username === params[0],
								);
								return { results: row ? [row] : [] };
							}

							if (/^SELECT .+ FROM users WHERE id = \?1/i.test(normalized)) {
								const row = users.find((user) => user.id === params[0]);
								return { results: row ? [row] : [] };
							}

							if (/^UPDATE users SET/i.test(normalized)) {
								const [
									first_name,
									last_name,
									username,
									email,
									password_hash,
									password_salt,
									id,
								] = params as string[];
								const row = users.find((user) => user.id === id);
								if (!row) {
									return { results: [] };
								}
								if (
									users.some(
										(user) =>
											user.id !== id && user.username === username,
									)
								) {
									throw uniqueError("username");
								}
								if (
									users.some(
										(user) => user.id !== id && user.email === email,
									)
								) {
									throw uniqueError("email");
								}
								row.first_name = first_name;
								row.last_name = last_name;
								row.username = username;
								row.email = email;
								row.password_hash = password_hash;
								row.password_salt = password_salt;
								return { results: [] };
							}

							if (/^DELETE FROM users WHERE id = \?1/i.test(normalized)) {
								const index = users.findIndex(
									(user) => user.id === params[0],
								);
								if (index >= 0) {
									users.splice(index, 1);
								}
								return { results: [] };
							}

							throw new Error(`Unhandled SQL in mock: ${normalized}`);
						},
					};
				},
			};
		},
	};

	return {
		memory: {
			users,
			inserts,
			DB,
			reset() {
				users.length = 0;
				inserts.length = 0;
			},
		},
	};
});

vi.mock("server-only", () => ({}));

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(async () => ({
		env: { DB: memory.DB },
	})),
}));

import {
	UserConflictError,
	createUser,
	deleteUser,
	getUserById,
	getUserByUsername,
	updateUser,
} from "./user-service";

const CLIENT_DIGEST = "c".repeat(64);
const PLAINTEXT = "never-stored-plaintext";

const ada = {
	firstName: "Ada",
	lastName: "Lovelace",
	username: "ada",
	email: "ada@school.edu",
	passwordSha256: CLIENT_DIGEST,
};

describe("user service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		memory.reset();
	});

	it("createUser returns a public user with id, names, username, and email", async () => {
		const user = await createUser(ada);
		expect(user.id).toEqual(expect.any(String));
		expect(user.id.length).toBeGreaterThan(0);
		expect(user).toMatchObject({
			firstName: "Ada",
			lastName: "Lovelace",
			username: "ada",
			email: "ada@school.edu",
		});
	});

	it("createUser omits password fields from the return value", async () => {
		const user = await createUser(ada);
		expect(user).not.toHaveProperty("password");
		expect(user).not.toHaveProperty("password_hash");
		expect(user).not.toHaveProperty("password_salt");
		expect(user).not.toHaveProperty("passwordHash");
		expect(user).not.toHaveProperty("passwordSalt");
	});

	it("inserts a salted hash, not the plaintext or the client digest", async () => {
		await createUser(ada);
		expect(memory.inserts).toHaveLength(1);
		const bound = memory.inserts[0] ?? [];
		expect(bound).not.toContain(PLAINTEXT);
		expect(bound).not.toContain(CLIENT_DIGEST);

		const passwordHash = bound[5];
		const passwordSalt = bound[6];
		expect(passwordHash).toEqual(expect.stringMatching(/^[a-f0-9]+$/));
		expect(passwordSalt).toEqual(expect.stringMatching(/^[a-f0-9]+$/));
		expect(passwordHash).not.toBe(CLIENT_DIGEST);
		expect(passwordSalt).not.toBe(CLIENT_DIGEST);
	});

	it("rejects a duplicate username or email as a conflict", async () => {
		await createUser(ada);

		await expect(
			createUser({ ...ada, email: "other@school.edu" }),
		).rejects.toBeInstanceOf(UserConflictError);

		await expect(
			createUser({
				...ada,
				username: "ada2",
				email: "ada@school.edu",
			}),
		).rejects.toBeInstanceOf(UserConflictError);
	});

	it("getUserByUsername returns the public user or null", async () => {
		const created = await createUser(ada);
		const found = await getUserByUsername("ada");
		expect(found).toEqual(created);
		expect(found).not.toHaveProperty("password_hash");
		await expect(getUserByUsername("missing")).resolves.toBeNull();
	});

	it("getUserById returns the public user or null", async () => {
		const created = await createUser(ada);
		const found = await getUserById(created.id);
		expect(found).toEqual(created);
		await expect(getUserById("missing-id")).resolves.toBeNull();
	});

	it("updateUser changes name fields and re-hashes only when a password is provided", async () => {
		const created = await createUser(ada);
		const originalHash = memory.users[0]?.password_hash;
		const originalSalt = memory.users[0]?.password_salt;

		const renamed = await updateUser(created.id, {
			firstName: "Augusta",
			lastName: "Byron",
		});
		expect(renamed).toMatchObject({
			id: created.id,
			firstName: "Augusta",
			lastName: "Byron",
			username: "ada",
			email: "ada@school.edu",
		});
		expect(memory.users[0]?.password_hash).toBe(originalHash);
		expect(memory.users[0]?.password_salt).toBe(originalSalt);

		const newDigest = "d".repeat(64);
		await updateUser(created.id, { passwordSha256: newDigest });
		expect(memory.users[0]?.password_hash).not.toBe(originalHash);
		expect(memory.users[0]?.password_salt).not.toBe(originalSalt);
		expect(memory.users[0]?.password_hash).not.toBe(newDigest);
	});

	it("deleteUser removes the row so later gets return null", async () => {
		const created = await createUser(ada);
		await deleteUser(created.id);
		await expect(getUserById(created.id)).resolves.toBeNull();
		await expect(getUserByUsername("ada")).resolves.toBeNull();
	});
});
