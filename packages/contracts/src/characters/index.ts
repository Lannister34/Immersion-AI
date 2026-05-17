import { z } from 'zod';

export const CharacterIdSchema = z.string().min(1).max(200);
export type CharacterId = z.infer<typeof CharacterIdSchema>;

export const CharacterSourceFormatSchema = z.enum(['png', 'json']);
export type CharacterSourceFormat = z.infer<typeof CharacterSourceFormatSchema>;

export const CharacterSummaryDtoSchema = z.object({
  avatarUrl: z.string().nullable(),
  id: CharacterIdSchema,
  name: z.string().min(1),
  source: CharacterSourceFormatSchema,
  updatedAt: z.string().min(1),
});
export type CharacterSummaryDto = z.infer<typeof CharacterSummaryDtoSchema>;

export const CharacterListResponseSchema = z.object({
  items: z.array(CharacterSummaryDtoSchema),
});
export type CharacterListResponse = z.infer<typeof CharacterListResponseSchema>;
