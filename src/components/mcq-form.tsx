"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
	createMcqAction,
	updateMcqAction,
} from "@/app/mcqs/actions";
import type { McqCorrect, PublicMcq } from "@/lib/mcq-schemas";
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
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const LETTERS = ["A", "B", "C", "D"] as const;

type McqFormProps = {
	mode: "create" | "edit";
	mcqId?: string;
	initialMcq?: PublicMcq | null;
	initialError?: string | null;
};

type FieldErrors = {
	prompt?: string;
	choiceA?: string;
	choiceB?: string;
	choiceC?: string;
	choiceD?: string;
	correct?: string;
	choices?: string;
};

function validate(values: {
	prompt: string;
	choiceA: string;
	choiceB: string;
	choiceC: string;
	choiceD: string;
	correct: McqCorrect | "";
}): FieldErrors {
	const errors: FieldErrors = {};
	const prompt = values.prompt.trim();
	const choiceA = values.choiceA.trim();
	const choiceB = values.choiceB.trim();
	const choiceC = values.choiceC.trim();
	const choiceD = values.choiceD.trim();

	if (!prompt) {
		errors.prompt = "Prompt is required";
	}
	if (!choiceA) {
		errors.choiceA = "Choice A is required";
	}
	if (!choiceB) {
		errors.choiceB = "Choice B is required";
	}
	if (!choiceC) {
		errors.choiceC = "Choice C is required";
	}
	if (!choiceD) {
		errors.choiceD = "Choice D is required";
	}
	if (!values.correct) {
		errors.correct = "Select the correct answer";
	}
	const filled = [choiceA, choiceB, choiceC, choiceD].filter(Boolean);
	if (filled.length === 4 && new Set(filled).size !== 4) {
		errors.choices = "Choices must be unique";
	}
	return errors;
}

export function McqForm({
	mode,
	mcqId,
	initialMcq = null,
	initialError = null,
}: McqFormProps) {
	const router = useRouter();
	const [prompt, setPrompt] = useState(initialMcq?.prompt ?? "");
	const [choiceA, setChoiceA] = useState(initialMcq?.choiceA ?? "");
	const [choiceB, setChoiceB] = useState(initialMcq?.choiceB ?? "");
	const [choiceC, setChoiceC] = useState(initialMcq?.choiceC ?? "");
	const [choiceD, setChoiceD] = useState(initialMcq?.choiceD ?? "");
	const [correct, setCorrect] = useState<McqCorrect | "">(
		initialMcq?.correct ?? "",
	);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const loadError = initialError;

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextErrors = validate({
			prompt,
			choiceA,
			choiceB,
			choiceC,
			choiceD,
			correct,
		});
		setFieldErrors(nextErrors);
		setFormError(null);
		if (Object.keys(nextErrors).length > 0 || !correct) {
			return;
		}

		const payload = {
			prompt: prompt.trim(),
			choiceA: choiceA.trim(),
			choiceB: choiceB.trim(),
			choiceC: choiceC.trim(),
			choiceD: choiceD.trim(),
			correct,
		};

		setPending(true);
		try {
			const result =
				mode === "edit" && mcqId
					? await updateMcqAction(mcqId, payload)
					: await createMcqAction(payload);
			if (!result.ok) {
				setFormError(result.error);
				return;
			}
			router.push("/mcqs");
		} finally {
			setPending(false);
		}
	}

	if (loadError) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-destructive" role="alert">
					{loadError}
				</p>
				<Link href="/mcqs">Back to questions</Link>
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					{mode === "create" ? "Add a question" : "Edit question"}
				</CardTitle>
				<CardDescription>
					Four choices, one correct answer. This bank is shared with every
					teacher.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} noValidate>
					<FieldGroup>
						<Field data-invalid={Boolean(fieldErrors.prompt) || undefined}>
							<FieldLabel htmlFor="prompt">Prompt</FieldLabel>
							<Input
								id="prompt"
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
							/>
							<FieldError
								errors={
									fieldErrors.prompt
										? [{ message: fieldErrors.prompt }]
										: undefined
								}
							/>
						</Field>
						{(
							[
								["choiceA", "Choice A", choiceA, setChoiceA],
								["choiceB", "Choice B", choiceB, setChoiceB],
								["choiceC", "Choice C", choiceC, setChoiceC],
								["choiceD", "Choice D", choiceD, setChoiceD],
							] as const
						).map(([id, label, value, setter]) => (
							<Field
								key={id}
								data-invalid={
									Boolean(fieldErrors[id]) || undefined
								}
							>
								<FieldLabel htmlFor={id}>{label}</FieldLabel>
								<Input
									id={id}
									value={value}
									onChange={(event) => setter(event.target.value)}
								/>
								<FieldError
									errors={
										fieldErrors[id]
											? [{ message: fieldErrors[id] }]
											: undefined
									}
								/>
							</Field>
						))}
						<Field
							data-invalid={
								Boolean(fieldErrors.correct || fieldErrors.choices) ||
								undefined
							}
						>
							<FieldLabel>Correct answer</FieldLabel>
							<div className="flex flex-wrap gap-4">
								{LETTERS.map((letter) => (
									<label
										key={letter}
										className="flex items-center gap-2 text-sm"
									>
										<input
											type="radio"
											name="correct"
											value={letter}
											checked={correct === letter}
											onChange={() => setCorrect(letter)}
										/>
										{letter}
									</label>
								))}
							</div>
							<FieldError
								errors={
									[
										fieldErrors.correct
											? { message: fieldErrors.correct }
											: undefined,
										fieldErrors.choices
											? { message: fieldErrors.choices }
											: undefined,
									].filter(Boolean) as { message: string }[]
								}
							/>
						</Field>
						<Field>
							{formError ? (
								<FieldError errors={[{ message: formError }]} />
							) : null}
							<Button type="submit" disabled={pending}>
								Save question
							</Button>
						</Field>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
