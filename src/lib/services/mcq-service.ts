import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { mcqInputSchema, type McqInput } from "@/lib/mcq-schemas";

export type { McqInput };

export type PublicMcq = {
	id: string;
	prompt: string;
	choiceA: string;
	choiceB: string;
	choiceC: string;
	choiceD: string;
	correct: McqInput["correct"];
	createdAt: string;
	updatedAt: string;
};

export class McqNotFoundError extends Error {
	constructor(message = "Question not found") {
		super(message);
		this.name = "McqNotFoundError";
	}
}

type McqRow = {
	id: string;
	prompt: string;
	choice_a: string;
	choice_b: string;
	choice_c: string;
	choice_d: string;
	correct: McqInput["correct"];
	created_at: string;
	updated_at: string;
};

const MCQ_COLUMNS =
	"id, prompt, choice_a, choice_b, choice_c, choice_d, correct, created_at, updated_at";

export async function createMcq(input: McqInput): Promise<PublicMcq> {
	const data = mcqInputSchema.parse(input);
	const id = crypto.randomUUID();

	await execute(
		`INSERT INTO mcqs (id, prompt, choice_a, choice_b, choice_c, choice_d, correct)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
		id,
		data.prompt,
		data.choiceA,
		data.choiceB,
		data.choiceC,
		data.choiceD,
		data.correct,
	);

	const row = await findRowById(id);
	if (!row) {
		throw new Error("Failed to load created question");
	}
	return toPublicMcq(row);
}

export async function listMcqs(): Promise<PublicMcq[]> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT ${MCQ_COLUMNS} FROM mcqs ORDER BY created_at DESC`,
		)
		.bind()
		.all<McqRow>();
	return results.map(toPublicMcq);
}

export async function getMcqById(id: string): Promise<PublicMcq | null> {
	const row = await findRowById(id);
	return row ? toPublicMcq(row) : null;
}

export async function updateMcq(
	id: string,
	input: McqInput,
): Promise<PublicMcq> {
	const data = mcqInputSchema.parse(input);
	const existing = await findRowById(id);
	if (!existing) {
		throw new McqNotFoundError();
	}

	await execute(
		`UPDATE mcqs
		 SET prompt = ?1, choice_a = ?2, choice_b = ?3, choice_c = ?4, choice_d = ?5,
		     correct = ?6, updated_at = CURRENT_TIMESTAMP
		 WHERE id = ?7`,
		data.prompt,
		data.choiceA,
		data.choiceB,
		data.choiceC,
		data.choiceD,
		data.correct,
		id,
	);

	const row = await findRowById(id);
	if (!row) {
		throw new McqNotFoundError();
	}
	return toPublicMcq(row);
}

export async function deleteMcq(id: string): Promise<void> {
	const existing = await findRowById(id);
	if (!existing) {
		throw new McqNotFoundError();
	}
	await execute("DELETE FROM mcqs WHERE id = ?1", id);
}

async function findRowById(id: string): Promise<McqRow | undefined> {
	return findFirst(
		`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1`,
		id,
	);
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
): Promise<McqRow | undefined> {
	const db = await getDb();
	const { results } = await db.prepare(sql).bind(...params).all<McqRow>();
	return results[0];
}

function toPublicMcq(row: McqRow): PublicMcq {
	return {
		id: row.id,
		prompt: row.prompt,
		choiceA: row.choice_a,
		choiceB: row.choice_b,
		choiceC: row.choice_c,
		choiceD: row.choice_d,
		correct: row.correct,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
