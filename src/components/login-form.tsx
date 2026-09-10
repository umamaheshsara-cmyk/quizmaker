"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { sha256Hex } from "@/lib/password";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const MIN_PASSWORD_LENGTH = 8;

export function LoginForm({
	className,
	...props
}: React.ComponentProps<"div">) {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<{
		username?: string;
		password?: string;
	}>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors: { username?: string; password?: string } = {};
		const trimmedUsername = username.trim();
		if (!trimmedUsername) {
			nextErrors.username = "Username is required";
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			nextErrors.password = "Password must be at least 8 characters";
		}
		setFieldErrors(nextErrors);
		setFormError(null);
		if (Object.keys(nextErrors).length > 0) {
			return;
		}

		setPending(true);
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username: trimmedUsername,
					password: await sha256Hex(password),
				}),
			});
			if (response.ok) {
				router.push("/mcqs");
				return;
			}
			const payload: unknown = await response.json().catch(() => null);
			const message =
				payload &&
				typeof payload === "object" &&
				"error" in payload &&
				typeof payload.error === "string"
					? payload.error
					: "Invalid username or password";
			setFormError(message);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>
						Enter your username below to login to your account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} noValidate>
						<FieldGroup>
							<Field data-invalid={Boolean(fieldErrors.username) || undefined}>
								<FieldLabel htmlFor="username">Username</FieldLabel>
								<Input
									id="username"
									type="text"
									autoComplete="username"
									value={username}
									onChange={(event) => setUsername(event.target.value)}
								/>
								<FieldError
									errors={
										fieldErrors.username
											? [{ message: fieldErrors.username }]
											: undefined
									}
								/>
							</Field>
							<Field data-invalid={Boolean(fieldErrors.password) || undefined}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
								<FieldError
									errors={
										fieldErrors.password
											? [{ message: fieldErrors.password }]
											: undefined
									}
								/>
							</Field>
							<Field>
								{formError ? (
									<FieldError errors={[{ message: formError }]} />
								) : null}
								<Button type="submit" disabled={pending}>
									Login
								</Button>
								<FieldDescription className="text-center">
									Don&apos;t have an account?{" "}
									<Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
