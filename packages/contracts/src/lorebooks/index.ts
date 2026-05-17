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
