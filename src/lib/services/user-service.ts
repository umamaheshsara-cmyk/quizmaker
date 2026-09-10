import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { z } from "zod";
import { hashPassword } from "@/lib/password-server";

export type PublicUser = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordSha256: string;
};

export type UpdateUserInput = {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	passwordSha256?: string;
};

export class UserConflictError extends Error {
	constructor(message = "Username or email already taken") {
		super(message);
		this.name = "UserConflictError";
	}
}

const passwordSha256Schema = z
	.string()
	.regex(/^[a-f0-9]{64}$/, "password digest must be a SHA-256 hex string");

const createUserSchema = z.object({
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().min(1),
	username: z.string().trim().min(1),
	email: z.string().trim().email(),
	passwordSha256: passwordSha256Schema,
});

const updateUserSchema = z.object({
	firstName: z.string().trim().min(1).optional(),
	lastName: z.string().trim().min(1).optional(),
	username: z.string().trim().min(1).optional(),
	email: z.string().trim().email().optional(),
	passwordSha256: passwordSha256Schema.optional(),
});

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	password_salt: string;
};

const USER_COLUMNS =
	"id, first_name, last_name, username, email, password_hash, password_salt";

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
	const data = createUserSchema.parse(input);
	const { salt, hash } = await hashPassword(data.passwordSha256);
	const id = crypto.randomUUID();

	try {
		await execute(
			`INSERT INTO users (id, first_name, last_name, username, email, password_hash, password_salt)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
			id,
			data.firstName,
			data.lastName,
			data.username,
			data.email,
			hash,
			salt,
		);
	} catch (error) {
		throwIfConflict(error);
		throw error;
	}

	return {
		id,
		firstName: data.firstName,
		lastName: data.lastName,
		username: data.username,
		email: data.email,
	};
}

export async function updateUser(
	id: string,
	patch: UpdateUserInput,
): Promise<PublicUser> {
	const data = updateUserSchema.parse(patch);
	const existing = await findRowById(id);
	if (!existing) {
		throw new Error("User not found");
	}

	const firstName = data.firstName ?? existing.first_name;
	const lastName = data.lastName ?? existing.last_name;
	const username = data.username ?? existing.username;
	const email = data.email ?? existing.email;
	let passwordHash = existing.password_hash;
	let passwordSalt = existing.password_salt;

	if (data.passwordSha256) {
		const hashed = await hashPassword(data.passwordSha256);
		passwordHash = hashed.hash;
		passwordSalt = hashed.salt;
	}

	try {
		await execute(
			`UPDATE users
			 SET first_name = ?1, last_name = ?2, username = ?3, email = ?4,
			     password_hash = ?5, password_salt = ?6, updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?7`,
			firstName,
			lastName,
			username,
			email,
			passwordHash,
			passwordSalt,
			id,
		);
	} catch (error) {
		throwIfConflict(error);
		throw error;
	}

	return { id, firstName, lastName, username, email };
}

export async function deleteUser(id: string): Promise<void> {
	await execute("DELETE FROM users WHERE id = ?1", id);
}

export async function getUserByUsername(
	username: string,
): Promise<PublicUser | null> {
	const row = await findFirst(
		`SELECT ${USER_COLUMNS} FROM users WHERE username = ?1`,
		username,
	);
	return row ? toPublicUser(row) : null;
}

export async function getUserById(id: string): Promise<PublicUser | null> {
	const row = await findRowById(id);
	return row ? toPublicUser(row) : null;
}

async function findRowById(id: string): Promise<UserRow | undefined> {
	return findFirst(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?1`, id);
}

async function getDb() {
	const { env } = await getCloudflareContext({ async: true });
	return env.DB;
}

async function execute(sql: string, ...params: unknown[]): Promise<void> {
	const db = await getDb();
	await db.prepare(sql).bind(...params).all();
}

async function findFirst(
	sql: string,
	...params: unknown[]
): Promise<UserRow | undefined> {
	const db = await getDb();
	const { results } = await db.prepare(sql).bind(...params).all<UserRow>();
	return results[0];
}

function toPublicUser(row: UserRow): PublicUser {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function throwIfConflict(error: unknown): void {
	if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
		throw new UserConflictError();
	}
}
