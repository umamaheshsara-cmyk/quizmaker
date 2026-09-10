import { z } from "zod";

const choiceSchema = z.string().trim().min(1).max(500);

export const mcqInputSchema = z
	.object({
		prompt: z.string().trim().min(1).max(2000),
		choiceA: choiceSchema,
		choiceB: choiceSchema,
		choiceC: choiceSchema,
		choiceD: choiceSchema,
		correct: z.enum(["A", "B", "C", "D"]),
	})
	.refine(
		(data) => {
			const choices = [
				data.choiceA,
				data.choiceB,
				data.choiceC,
				data.choiceD,
			];
			return new Set(choices).size === 4;
		},
		{ message: "Choices must be unique" },
	);

export const mcqIdSchema = z.string().trim().min(1);

export type McqInput = z.infer<typeof mcqInputSchema>;
export type McqCorrect = McqInput["correct"];

export type PublicMcq = McqInput & {
	id: string;
	createdAt: string;
	updatedAt: string;
};
