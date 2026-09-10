import { mcqInputSchema } from "@/lib/mcq-schemas";
import { jsonError } from "@/lib/http";
import { createMcq, listMcqs } from "@/lib/services/mcq-service";

export async function GET() {
	try {
		const mcqs = await listMcqs();
		return Response.json({ mcqs });
	} catch {
		return jsonError("Server error", 500);
	}
}

export async function POST(request: Request) {
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
		const mcq = await createMcq(parsed.data);
		return Response.json(mcq, { status: 201 });
	} catch {
		return jsonError("Server error", 500);
	}
}
