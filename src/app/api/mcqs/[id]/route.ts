import { mcqInputSchema } from "@/lib/mcq-schemas";
import { jsonError } from "@/lib/http";
import {
	McqNotFoundError,
	deleteMcq,
	getMcqById,
	updateMcq,
} from "@/lib/services/mcq-service";

type RouteContext = {
	params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	try {
		const mcq = await getMcqById(id);
		if (!mcq) {
			return jsonError("Question not found", 404);
		}
		return Response.json(mcq);
	} catch {
		return jsonError("Server error", 500);
	}
}

export async function PUT(request: Request, context: RouteContext) {
	const { id } = await context.params;
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = mcqInputSchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation failed", 400);
	}

	try {
		const mcq = await updateMcq(id, parsed.data);
		return Response.json(mcq);
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	const { id } = await context.params;
	try {
		await deleteMcq(id);
		return Response.json({ ok: true });
	} catch (error) {
		if (error instanceof McqNotFoundError) {
			return jsonError(error.message, 404);
		}
		return jsonError("Server error", 500);
	}
}
