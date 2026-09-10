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

function attemptsTableDefinition(sql: string): string {
	const match = sql.match(/CREATE TABLE attempts\s*\(([\s\S]*?)\)\s*;/i);
	expect(match, "expected a CREATE TABLE attempts statement").not.toBeNull();
	return match?.[1] ?? "";
}

describe("attempts migration schema", () => {
	it("has a SQL migration that creates the attempts table", () => {
		expect(existsSync(MIGRATIONS_DIR)).toBe(true);
		expect(readAllMigrationSql()).toMatch(/CREATE TABLE attempts/i);
	});

	it("stores the question id, selected letter, and server-side correctness", () => {
		const columns = attemptsTableDefinition(readAllMigrationSql());
		expect(columns).toMatch(/\bmcq_id\b/i);
		expect(columns).toMatch(/\bselected\b/i);
		expect(columns).toMatch(/\bis_correct\b/i);
		expect(columns).toMatch(/\bcreated_at\b/i);
		expect(columns).toMatch(/CHECK\s*\(\s*selected\s+IN\s*\(\s*'A'\s*,\s*'B'\s*,\s*'C'\s*,\s*'D'\s*\)\s*\)/i);
	});

	it("does not store a client-supplied user id", () => {
		const columns = attemptsTableDefinition(readAllMigrationSql());
		expect(columns).not.toMatch(/\buser_id\b/i);
		expect(columns).not.toMatch(/\bowner_id\b/i);
	});
});
