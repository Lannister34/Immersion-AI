import { z } from 'zod';

export const LorebookIdSchema = z.string().min(1).max(200);
export type LorebookId = z.infer<typeof LorebookIdSchema>;

export const LorebookSummaryDtoSchema = z.object({
  entryCount: z.number().int().nonnegative(),
  id: LorebookIdSchema,
  name: z.string().min(1),
  tags: z.array(z.string()),
  updatedAt: z.string().min(1),
});
export type LorebookSummaryDto = z.infer<typeof LorebookSummaryDtoSchema>;

export const LorebookListResponseSchema = z.object({
  items: z.array(LorebookSummaryDtoSchema),
});
export type LorebookListResponse = z.infer<typeof LorebookListResponseSchema>;

export const LorebookEntryDtoSchema = z.object({
  content: z.string(),
  enabled: z.boolean(),
  keys: z.array(z.string()),
  priority: z.number().int(),
});
export type LorebookEntryDto = z.infer<typeof LorebookEntryDtoSchema>;

export const LorebookDetailDtoSchema = z.object({
  createdAt: z.string().nullable(),
  entries: z.array(LorebookEntryDtoSchema),
  id: LorebookIdSchema,
  name: z.string().min(1),
  tags: z.array(z.string()),
  updatedAt: z.string().min(1),
});
export type LorebookDetailDto = z.infer<typeof LorebookDetailDtoSchema>;

export const LorebookDetailResponseSchema = z.object({
  lorebook: LorebookDetailDtoSchema,
});
export type LorebookDetailResponse = z.infer<typeof LorebookDetailResponseSchema>;

export const SaveLorebookEntryCommandSchema = z.object({
  content: z.string().max(20_000).default(''),
  enabled: z.boolean().default(true),
  keys: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  priority: z.number().int().min(-100).max(100).default(0),
});
export type SaveLorebookEntryCommand = z.infer<typeof SaveLorebookEntryCommandSchema>;

export const SaveLorebookCommandSchema = z.object({
  entries: z.array(SaveLorebookEntryCommandSchema).max(500).default([]),
  name: z.string().trim().min(1).max(200),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
});
export type SaveLorebookCommand = z.infer<typeof SaveLorebookCommandSchema>;
