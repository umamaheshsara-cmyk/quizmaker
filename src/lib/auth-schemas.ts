import { z } from "zod";

export const passwordDigestSchema = z
	.string()
	.regex(/^[a-f0-9]{64}$/, "password must be a SHA-256 hex digest");

export const registerBodySchema = z.object({
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().min(1),
	username: z.string().trim().min(1),
	email: z.string().trim().email(),
	password: passwordDigestSchema,
});

export const loginBodySchema = z.object({
	username: z.string().trim().min(1),
	password: passwordDigestSchema,
});
