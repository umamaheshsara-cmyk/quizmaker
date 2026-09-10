import { loginBodySchema } from "@/lib/auth-schemas";
import { jsonError } from "@/lib/http";
import { authenticateUser } from "@/lib/services/user-service";

export const INVALID_CREDENTIALS = "Invalid username or password";

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return jsonError("Invalid JSON", 400);
	}

	const parsed = loginBodySchema.safeParse(body);
	if (!parsed.success) {
		return jsonError("Validation failed", 400);
	}

	try {
		const user = await authenticateUser(
			parsed.data.username,
			parsed.data.password,
		);
		if (!user) {
			return jsonError(INVALID_CREDENTIALS, 401);
		}
		return Response.json(user);
	} catch {
		return jsonError("Server error", 500);
	}
}
