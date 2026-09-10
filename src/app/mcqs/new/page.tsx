import Link from "next/link";

import { McqForm } from "@/components/mcq-form";

export default function NewMcqPage() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<Link href="/mcqs" className="text-sm text-muted-foreground underline">
				Back to questions
			</Link>
			<McqForm mode="create" />
		</main>
	);
}
