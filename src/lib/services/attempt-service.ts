import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { McqCorrect } from "@/lib/mcq-schemas";
import { McqNotFoundError } from "@/lib/services/mcq-service";

export type AttemptResult = {
	attemptId: string;
	isCorrect: boolean;
	correct: McqCorrect;
};

export async function submitAttempt(
	mcqId: string,
	selected: McqCorrect,
): Promise<AttemptResult> {
	const db = await getDb();
	const { results } = await db
		.prepare("SELECT correct FROM mcqs WHERE id = ?1")
		.bind(mcqId)
		.all<{ correct: McqCorrect }>();
	const row = results[0];
	if (!row) {
		throw new McqNotFoundError();
	}

	const isCorrect = row.correct === selected;
	const attemptId = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO attempts (id, mcq_id, selected, is_correct)
			 VALUES (?1, ?2, ?3, ?4)`,
		)
		.bind(attemptId, mcqId, selected, isCorrect ? 1 : 0)
		.all();

	return {
		attemptId,
		isCorrect,
		correct: row.correct,
	};
}

async function getDb() {
	const { env } = await getCloudflareContext({ async: true });
	return env.DB;
}
