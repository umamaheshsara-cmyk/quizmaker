import { Suspense } from "react";
import Link from "next/link";

import { getMcqAction } from "@/app/mcqs/actions";
import { McqForm, McqFormFallback } from "@/components/mcq-form";

export const dynamic = "force-dynamic";

async function EditMcqLoader({ id }: { id: string }) {
	const result = await getMcqAction(id);

	return (
		<McqForm
			mode="edit"
			mcqId={id}
			initialMcq={result.ok ? result.mcq : null}
			initialError={result.ok ? null : result.error}
		/>
	);
}

export default async function EditMcqPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<Link href="/mcqs" className="text-sm text-muted-foreground underline">
				Back to questions
			</Link>
			<Suspense fallback={<McqFormFallback />}>
				<EditMcqLoader id={id} />
			</Suspense>
		</main>
	);
}
