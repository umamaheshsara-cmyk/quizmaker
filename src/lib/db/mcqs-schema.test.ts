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

function mcqsTableDefinition(sql: string): string {
	const match = sql.match(/CREATE TABLE mcqs\s*\(([\s\S]*?)\)\s*;/i);
	expect(match, "expected a CREATE TABLE mcqs statement").not.toBeNull();
	return match?.[1] ?? "";
}

describe("mcqs migration schema", () => {
	it("has a SQL migration that creates the mcqs table", () => {
		expect(existsSync(MIGRATIONS_DIR)).toBe(true);
		expect(readAllMigrationSql()).toMatch(/CREATE TABLE mcqs/i);
	});

	it("defines prompt, four choices, correct CHECK A-D, and timestamps", () => {
		const columns = mcqsTableDefinition(readAllMigrationSql());
		const required = [
			"id",
			"prompt",
			"choice_a",
			"choice_b",
			"choice_c",
			"choice_d",
			"correct",
			"created_at",
			"updated_at",
		];
		for (const column of required) {
			expect(columns).toMatch(new RegExp(`\\b${column}\\b`, "i"));
		}
		expect(columns).toMatch(
			/CHECK\s*\(\s*correct\s+IN\s*\(\s*'A'\s*,\s*'B'\s*,\s*'C'\s*,\s*'D'\s*\)\s*\)/i,
		);
	});

	it("does not add an author or user_id column", () => {
		const columns = mcqsTableDefinition(readAllMigrationSql());
		expect(columns).not.toMatch(/\buser_id\b/i);
		expect(columns).not.toMatch(/\bauthor\b/i);
		expect(columns).not.toMatch(/\bcreated_by\b/i);
	});

	it("indexes created_at", () => {
		expect(readAllMigrationSql()).toMatch(
			/CREATE INDEX\s+\S+\s+ON mcqs\s*\(\s*created_at\s*\)/i,
		);
	});
});
