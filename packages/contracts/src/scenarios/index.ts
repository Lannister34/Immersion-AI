import { z } from 'zod';

export const ScenarioIdSchema = z.string().min(1).max(200);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export const ScenarioSummaryDtoSchema = z.object({
  concept: z.string().nullable(),
  createdAt: z.string().nullable(),
  id: ScenarioIdSchema,
  name: z.string().min(1),
  preview: z.string().nullable(),
  tags: z.array(z.string()),
  updatedAt: z.string().min(1),
});
export type ScenarioSummaryDto = z.infer<typeof ScenarioSummaryDtoSchema>;

export const ScenarioListResponseSchema = z.object({
  items: z.array(ScenarioSummaryDtoSchema),
});
export type ScenarioListResponse = z.infer<typeof ScenarioListResponseSchema>;
