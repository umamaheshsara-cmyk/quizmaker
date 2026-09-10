"use client";

import { useState } from "react";
import Link from "next/link";

import { deleteMcqAction, listMcqsAction } from "@/app/mcqs/actions";
import type { PublicMcq } from "@/lib/mcq-schemas";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const PROMPT_PREVIEW_LENGTH = 80;

const CHOICES = [
	{ letter: "A", key: "choiceA" },
	{ letter: "B", key: "choiceB" },
	{ letter: "C", key: "choiceC" },
	{ letter: "D", key: "choiceD" },
] as const;

function previewPrompt(prompt: string) {
	if (prompt.length <= PROMPT_PREVIEW_LENGTH) {
		return prompt;
	}
	return `${prompt.slice(0, PROMPT_PREVIEW_LENGTH)}…`;
}

type McqListProps = {
	initialMcqs: PublicMcq[];
	initialError?: string | null;
};

export function McqListFallback() {
	return (
		<p className="text-muted-foreground" role="status">
			Loading questions…
		</p>
	);
}

export function McqList({ initialMcqs, initialError = null }: McqListProps) {
	const [mcqs, setMcqs] = useState(initialMcqs);
	const [error, setError] = useState(initialError);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [refreshing, setRefreshing] = useState(false);

	const previewMcq = mcqs.find((mcq) => mcq.id === previewId) ?? null;

	async function refresh() {
		setRefreshing(true);
		try {
			const result = await listMcqsAction();
			if (!result.ok) {
				setError(result.error);
				setMcqs([]);
				return;
			}
			setError(null);
			setMcqs(result.mcqs);
		} finally {
			setRefreshing(false);
		}
	}

	async function confirmDelete() {
		if (!pendingId) {
			return;
		}
		setDeleting(true);
		try {
			const result = await deleteMcqAction(pendingId);
			if (!result.ok) {
				setError(result.error);
				setPendingId(null);
				return;
			}
			setPendingId(null);
			await refresh();
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-end">
				<Link href="/mcqs/new" className={buttonVariants()}>
					Create Question
				</Link>
			</div>
			{refreshing ? <McqListFallback /> : null}
			{error ? (
				<p className="text-destructive" role="alert">
					{error}
				</p>
			) : null}
			{mcqs.length === 0 && !error && !refreshing ? (
				<p className="text-muted-foreground">
					No questions in the shared bank yet. Create the first one to get
					started.
				</p>
			) : null}
			{mcqs.length > 0 ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Prompt</TableHead>
							<TableHead>Correct</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="max-w-md whitespace-normal">
									{previewPrompt(mcq.prompt)}
								</TableCell>
								<TableCell>{mcq.correct}</TableCell>
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => setPreviewId(mcq.id)}
										>
											Preview
										</Button>
										<Link
											href={`/mcqs/${mcq.id}/edit`}
											className={buttonVariants({
												variant: "outline",
												size: "sm",
											})}
										>
											Edit
										</Link>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => setPendingId(mcq.id)}
										>
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : null}
			<Dialog
				open={previewMcq !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPreviewId(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Preview question</DialogTitle>
						<DialogDescription>
							Read-only view of this shared-bank question.
						</DialogDescription>
					</DialogHeader>
					{previewMcq ? (
						<div className="flex flex-col gap-3">
							<p className="whitespace-pre-wrap">{previewMcq.prompt}</p>
							<ul className="flex flex-col gap-2">
								{CHOICES.map(({ letter, key }) => (
									<li
										key={letter}
										className="flex items-center gap-2 whitespace-normal"
									>
										<span>
											{letter}. {previewMcq[key]}
										</span>
										{previewMcq.correct === letter ? (
											<Badge>Correct</Badge>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setPreviewId(null)}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={pendingId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingId(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete this question?</DialogTitle>
						<DialogDescription>
							This removes the question from the shared bank. This cannot
							be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setPendingId(null)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={() => void confirmDelete()}
							disabled={deleting}
						>
							Delete question
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
