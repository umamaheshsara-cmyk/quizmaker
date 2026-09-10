"use client";

import { useState } from "react";
import Link from "next/link";

import { submitAttemptAction } from "@/app/mcqs/actions";
import type { AttemptMcq, McqCorrect } from "@/lib/mcq-schemas";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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

const CHOICES = [
	{ letter: "A" as const, key: "choiceA" as const },
	{ letter: "B" as const, key: "choiceB" as const },
	{ letter: "C" as const, key: "choiceC" as const },
	{ letter: "D" as const, key: "choiceD" as const },
];

type McqAttemptProps = {
	mcq: AttemptMcq | null;
	initialError?: string | null;
};

type Grade = {
	isCorrect: boolean;
	correct: McqCorrect;
};

export function McqAttemptFallback() {
	return (
		<p className="text-muted-foreground" role="status">
			Loading question…
		</p>
	);
}

export function McqAttempt({
	mcq,
	initialError = null,
}: McqAttemptProps) {
	const [selected, setSelected] = useState<McqCorrect | "">("");
	const [fieldError, setFieldError] = useState<string | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [grade, setGrade] = useState<Grade | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit() {
		if (!mcq) {
			return;
		}
		if (!selected) {
			setFieldError("Select an answer");
			return;
		}
		setFieldError(null);
		setFormError(null);
		setPending(true);
		try {
			const result = await submitAttemptAction(mcq.id, selected);
			if (!result.ok) {
				setFormError(result.error);
				return;
			}
			setGrade({
				isCorrect: result.isCorrect,
				correct: result.correct,
			});
		} finally {
			setPending(false);
		}
	}

	function tryAgain() {
		setSelected("");
		setGrade(null);
		setFieldError(null);
		setFormError(null);
	}

	if (initialError || !mcq) {
		return (
			<div className="flex flex-col gap-4">
				<p className="text-destructive" role="alert">
					{initialError ?? "Question not found"}
				</p>
				<Link href="/mcqs">Back</Link>
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle role="heading" aria-level={2}>
					Preview question
				</CardTitle>
				<CardDescription>
					Choose an answer. The correct letter is checked on the server.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void onSubmit();
					}}
					noValidate
				>
				<FieldGroup>
					<p className="whitespace-pre-wrap">{mcq.prompt}</p>
					<Field data-invalid={Boolean(fieldError) || undefined}>
						<FieldLabel id="attempt-answer-label">Your answer</FieldLabel>
						<div
							role="radiogroup"
							aria-labelledby="attempt-answer-label"
							className="flex flex-col gap-2"
						>
							{CHOICES.map(({ letter, key }) => (
								<label
									key={letter}
									className="flex items-center gap-2 text-sm"
								>
									<input
										type="radio"
										name="selected"
										value={letter}
										checked={selected === letter}
										disabled={grade !== null || pending}
										onChange={() => setSelected(letter)}
									/>
									{letter}. {mcq[key]}
								</label>
							))}
						</div>
						<FieldError
							errors={
								fieldError ? [{ message: fieldError }] : undefined
							}
						/>
					</Field>
					{pending ? (
						<p className="text-muted-foreground" role="status">
							Checking…
						</p>
					) : null}
					{grade ? (
						<div className="flex flex-col gap-2" role="status">
							<Badge
								variant={grade.isCorrect ? "default" : "destructive"}
							>
								{grade.isCorrect ? "Correct" : "Incorrect"}
							</Badge>
							{grade.isCorrect ? null : (
								<p>Correct answer is {grade.correct}</p>
							)}
						</div>
					) : null}
					{formError ? (
						<p className="text-destructive" role="alert">
							{formError}
						</p>
					) : null}
					<div className="flex flex-wrap gap-2">
						{grade ? (
							<Button type="button" onClick={tryAgain}>
								Try Again
							</Button>
						) : (
							<Button type="submit" disabled={pending}>
								Submit
							</Button>
						)}
						<Link
							href="/mcqs"
							className={buttonVariants({ variant: "outline" })}
						>
							Back
						</Link>
					</div>
				</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
