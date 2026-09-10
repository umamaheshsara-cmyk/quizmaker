"use server";

import { revalidatePath } from "next/cache";
import { mcqIdSchema, mcqInputSchema } from "@/lib/mcq-schemas";
import {
	McqNotFoundError,
	createMcq,
	deleteMcq,
	getMcqById,
	listMcqs,
	updateMcq,
	type PublicMcq,
} from "@/lib/services/mcq-service";

export type McqActionOk<T> = { ok: true } & T;
export type McqActionError = { ok: false; error: string };
export type McqActionResult<T> = McqActionOk<T> | McqActionError;

function fail(error: string): McqActionError {
	return { ok: false, error };
}

function fromUnknown(error: unknown): McqActionError {
	if (error instanceof McqNotFoundError) {
		return fail(error.message);
	}
	return fail("Server error");
}

export async function listMcqsAction(): Promise<
	McqActionResult<{ mcqs: PublicMcq[] }>
> {
	try {
		const mcqs = await listMcqs();
		return { ok: true, mcqs };
	} catch (error) {
		return fromUnknown(error);
	}
}

export async function getMcqAction(
	id: unknown,
): Promise<McqActionResult<{ mcq: PublicMcq }>> {
	const parsedId = mcqIdSchema.safeParse(id);
	if (!parsedId.success) {
		return fail("Validation failed");
	}

	try {
		const mcq = await getMcqById(parsedId.data);
		if (!mcq) {
			return fail("Question not found");
		}
		return { ok: true, mcq };
	} catch (error) {
		return fromUnknown(error);
	}
}

export async function createMcqAction(
	input: unknown,
): Promise<McqActionResult<{ mcq: PublicMcq }>> {
	const parsed = mcqInputSchema.safeParse(input);
	if (!parsed.success) {
		return fail("Validation failed");
	}

	try {
		const mcq = await createMcq(parsed.data);
		revalidatePath("/mcqs");
		return { ok: true, mcq };
	} catch (error) {
		return fromUnknown(error);
	}
}

export async function updateMcqAction(
	id: unknown,
	input: unknown,
): Promise<McqActionResult<{ mcq: PublicMcq }>> {
	const parsedId = mcqIdSchema.safeParse(id);
	const parsed = mcqInputSchema.safeParse(input);
	if (!parsedId.success || !parsed.success) {
		return fail("Validation failed");
	}

	try {
		const mcq = await updateMcq(parsedId.data, parsed.data);
		revalidatePath("/mcqs");
		return { ok: true, mcq };
	} catch (error) {
		return fromUnknown(error);
	}
}

export async function deleteMcqAction(
	id: unknown,
): Promise<McqActionResult<Record<string, never>>> {
	const parsedId = mcqIdSchema.safeParse(id);
	if (!parsedId.success) {
		return fail("Validation failed");
	}

	try {
		await deleteMcq(parsedId.data);
		revalidatePath("/mcqs");
		return { ok: true };
	} catch (error) {
		return fromUnknown(error);
	}
}
