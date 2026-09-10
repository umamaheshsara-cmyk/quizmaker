import { registerBodySchema } from "@/lib/auth-schemas";
import { jsonError } from "@/lib/http";
import { UserConflictError, createUser } from "@/lib/services/user-service";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = registerBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation failed", 400);
	}

	try {
		const user = await createUser({
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
			username: parsed.data.username,
			email: parsed.data.email,
			passwordSha256: parsed.data.password,
		});
		return Response.json(user, { status: 201 });
	} catch (error) {
		if (error instanceof UserConflictError) {
			return jsonError(error.message, 409);
		}
		return jsonError("Server error", 500);
	}
}
