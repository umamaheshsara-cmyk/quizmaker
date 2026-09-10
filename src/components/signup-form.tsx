"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({ ...props }: React.ComponentProps<typeof Card>) {
	const router = useRouter();
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors: Record<string, string> = {};
		const trimmedFirst = firstName.trim();
		const trimmedLast = lastName.trim();
		const trimmedUsername = username.trim();
		const trimmedEmail = email.trim();

		if (!trimmedFirst) {
			nextErrors.firstName = "First name is required";
		}
		if (!trimmedLast) {
			nextErrors.lastName = "Last name is required";
		}
		if (!trimmedUsername) {
			nextErrors.username = "Username is required";
		}
		if (!trimmedEmail) {
			nextErrors.email = "Email is required";
		} else if (!EMAIL_PATTERN.test(trimmedEmail)) {
			nextErrors.email = "Enter a valid email address";
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			nextErrors.password = "Password must be at least 8 characters";
		}
		if (!confirmPassword) {
			nextErrors.confirmPassword = "Please confirm your password";
		} else if (confirmPassword !== password) {
			nextErrors.confirmPassword = "Passwords do not match";
		}

		setFieldErrors(nextErrors);
		setFormError(null);
		if (Object.keys(nextErrors).length > 0) {
			return;
		}

		setPending(true);
		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					firstName: trimmedFirst,
					lastName: trimmedLast,
					username: trimmedUsername,
					email: trimmedEmail,
					password: await sha256Hex(password),
				}),
			});
			if (response.status === 201) {
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
					: "Could not create your account";
			setFormError(message);
		} finally {
			setPending(false);
		}
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} noValidate>
					<FieldGroup>
						<Field data-invalid={Boolean(fieldErrors.firstName) || undefined}>
							<FieldLabel htmlFor="first-name">First Name</FieldLabel>
							<Input
								id="first-name"
								type="text"
								placeholder="Ada"
								autoComplete="given-name"
								value={firstName}
								onChange={(event) => setFirstName(event.target.value)}
							/>
							<FieldError
								errors={
									fieldErrors.firstName
										? [{ message: fieldErrors.firstName }]
										: undefined
								}
							/>
						</Field>
						<Field data-invalid={Boolean(fieldErrors.lastName) || undefined}>
							<FieldLabel htmlFor="last-name">Last Name</FieldLabel>
							<Input
								id="last-name"
								type="text"
								placeholder="Lovelace"
								autoComplete="family-name"
								value={lastName}
								onChange={(event) => setLastName(event.target.value)}
							/>
							<FieldError
								errors={
									fieldErrors.lastName
										? [{ message: fieldErrors.lastName }]
										: undefined
								}
							/>
						</Field>
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
						<Field data-invalid={Boolean(fieldErrors.email) || undefined}>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input
								id="email"
								type="email"
								placeholder="m@example.com"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
							/>
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your
								email with anyone else.
							</FieldDescription>
							<FieldError
								errors={
									fieldErrors.email
										? [{ message: fieldErrors.email }]
										: undefined
								}
							/>
						</Field>
						<Field data-invalid={Boolean(fieldErrors.password) || undefined}>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<FieldDescription>
								Must be at least 8 characters long.
							</FieldDescription>
							<FieldError
								errors={
									fieldErrors.password
										? [{ message: fieldErrors.password }]
										: undefined
								}
							/>
						</Field>
						<Field
							data-invalid={
								Boolean(fieldErrors.confirmPassword) || undefined
							}
						>
							<FieldLabel htmlFor="confirm-password">
								Confirm Password
							</FieldLabel>
							<Input
								id="confirm-password"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(event) =>
									setConfirmPassword(event.target.value)
								}
							/>
							<FieldDescription>
								Please confirm your password.
							</FieldDescription>
							<FieldError
								errors={
									fieldErrors.confirmPassword
										? [{ message: fieldErrors.confirmPassword }]
										: undefined
								}
							/>
						</Field>
						<FieldGroup>
							<Field>
								{formError ? (
									<FieldError errors={[{ message: formError }]} />
								) : null}
								<Button type="submit" disabled={pending}>
									Create Account
								</Button>
								<FieldDescription className="px-6 text-center">
									Already have an account?{" "}
									<Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
