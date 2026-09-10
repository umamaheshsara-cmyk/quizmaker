"use client";

import { useState } from "react";
import Link from "next/link";

import { deleteMcqAction, listMcqsAction } from "@/app/mcqs/actions";
import type { PublicMcq } from "@/lib/mcq-schemas";
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

export function McqList({ initialMcqs, initialError = null }: McqListProps) {
	const [mcqs, setMcqs] = useState(initialMcqs);
	const [error, setError] = useState(initialError);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	async function refresh() {
		const result = await listMcqsAction();
		if (!result.ok) {
			setError(result.error);
			setMcqs([]);
			return;
		}
		setError(null);
		setMcqs(result.mcqs);
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
					Add question
				</Link>
			</div>
			{error ? (
				<p className="text-destructive" role="alert">
					{error}
				</p>
			) : null}
			{mcqs.length === 0 && !error ? (
				<p className="text-muted-foreground">
					No questions in the shared bank yet. Add the first one to get
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
