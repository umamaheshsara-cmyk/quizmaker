import { Suspense } from "react";

import { getMcqForAttemptAction } from "@/app/mcqs/actions";
import { McqAttempt, McqAttemptFallback } from "@/components/mcq-attempt";

export const dynamic = "force-dynamic";

async function AttemptLoader({ id }: { id: string }) {
	const result = await getMcqForAttemptAction(id);

	return (
		<McqAttempt
			mcq={result.ok ? result.mcq : null}
			initialError={result.ok ? null : result.error}
		/>
	);
}

export default async function PreviewMcqPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<Suspense fallback={<McqAttemptFallback />}>
				<AttemptLoader id={id} />
			</Suspense>
		</main>
	);
}
