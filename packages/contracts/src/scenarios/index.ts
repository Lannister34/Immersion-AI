import { z } from 'zod';

import { createFileIdSchema } from '../common/file-id.js';

export const ScenarioIdSchema = createFileIdSchema('Scenario id');
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

export const ScenarioDetailDtoSchema = z.object({
  concept: z.string(),
  content: z.string(),
  createdAt: z.string().nullable(),
  id: ScenarioIdSchema,
  name: z.string().min(1),
  tags: z.array(z.string()),
  updatedAt: z.string().min(1),
});
export type ScenarioDetailDto = z.infer<typeof ScenarioDetailDtoSchema>;

export const ScenarioDetailResponseSchema = z.object({
  scenario: ScenarioDetailDtoSchema,
});
export type ScenarioDetailResponse = z.infer<typeof ScenarioDetailResponseSchema>;

export const SaveScenarioCommandSchema = z.object({
  concept: z.string().max(2_000).default(''),
  content: z.string().max(20_000).default(''),
  name: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
});
export type SaveScenarioCommand = z.infer<typeof SaveScenarioCommandSchema>;
