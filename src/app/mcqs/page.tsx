import { LogoutButton } from "@/components/logout-button";

export default function McqsPage() {
	return (
		<main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6 md:p-10">
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2">
					<h1 className="font-heading text-2xl font-medium">
						Multiple-choice questions
					</h1>
					<p className="text-muted-foreground">
						This is where teachers will build a shared bank of
						multiple-choice questions. That workflow is coming in a later
						sprint.
					</p>
				</div>
				<LogoutButton />
			</div>
		</main>
	);
}
