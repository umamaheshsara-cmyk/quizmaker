import { Suspense } from "react";

import { LogoutButton } from "@/components/logout-button";
import { McqList, McqListFallback } from "@/components/mcq-list";
import { listMcqsAction } from "@/app/mcqs/actions";

export const dynamic = "force-dynamic";

async function McqBank() {
	const result = await listMcqsAction();
	const initialMcqs = result.ok ? result.mcqs : [];
	const initialError = result.ok ? null : result.error;

	return <McqList initialMcqs={initialMcqs} initialError={initialError} />;
}

export default function McqsPage() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2">
					<h1 className="font-heading text-2xl font-medium">
						Shared multiple-choice question bank
					</h1>
					<p className="text-muted-foreground">
						Teachers collaborate here on a shared bank of four-choice
						questions. Anyone with this page can add, edit, or remove
						questions — there is no per-teacher ownership yet.
					</p>
				</div>
				<LogoutButton />
			</div>
			<Suspense fallback={<McqListFallback />}>
				<McqBank />
			</Suspense>
		</main>
	);
}
