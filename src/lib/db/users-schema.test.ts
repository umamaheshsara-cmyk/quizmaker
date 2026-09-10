import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

function readAllMigrationSql(): string {
	if (!existsSync(MIGRATIONS_DIR)) {
		return "";
	}

	return readdirSync(MIGRATIONS_DIR)
		.filter((file) => file.endsWith(".sql"))
		.sort()
		.map((file) => readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
		.join("\n");
}

function usersTableDefinition(sql: string): string {
	const match = sql.match(/CREATE TABLE users\s*\(([\s\S]*?)\)\s*;/i);
	expect(match, "expected a CREATE TABLE users statement").not.toBeNull();
	return match?.[1] ?? "";
}

describe("users migration schema", () => {
	it("has a SQL migration that creates the users table", () => {
		expect(existsSync(MIGRATIONS_DIR)).toBe(true);

		const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((file) =>
			file.endsWith(".sql"),
		);
		expect(sqlFiles.length).toBeGreaterThan(0);
		expect(readAllMigrationSql()).toMatch(/CREATE TABLE users/i);
	});

	it("defines the required users columns", () => {
		const columns = usersTableDefinition(readAllMigrationSql());
		const required = [
			"id",
			"first_name",
			"last_name",
			"username",
			"email",
			"password_hash",
			"password_salt",
			"created_at",
			"updated_at",
		];

		for (const column of required) {
			expect(columns).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}
	});

	it("enforces uniqueness on username and email", () => {
		const columns = usersTableDefinition(readAllMigrationSql());
		expect(columns).toMatch(/username\s+TEXT\s+NOT NULL\s+UNIQUE/i);
		expect(columns).toMatch(/email\s+TEXT\s+NOT NULL\s+UNIQUE/i);
	});

	it("indexes username and email", () => {
		const sql = readAllMigrationSql();
		expect(sql).toMatch(
			/CREATE INDEX\s+\S+\s+ON users\s*\(\s*username\s*\)/i,
		);
		expect(sql).toMatch(/CREATE INDEX\s+\S+\s+ON users\s*\(\s*email\s*\)/i);
	});

	it("does not store a plaintext password column", () => {
		const columns = usersTableDefinition(readAllMigrationSql());
		const columnNames = [
			...columns.matchAll(/^\s*([a-z_]+)\s+/gim),
		].map((match) => match[1].toLowerCase());

		expect(columnNames).toContain("password_hash");
		expect(columnNames).toContain("password_salt");
		expect(columnNames).not.toContain("password");
	});
});
