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

export const CharacterDetailDtoSchema = z.object({
  avatarUrl: z.string().nullable(),
  createdAt: z.string().nullable(),
  description: z.string(),
  exampleDialogue: z.string(),
  firstMessage: z.string(),
  id: CharacterIdSchema,
  isEditable: z.boolean(),
  name: z.string().min(1),
  personality: z.string(),
  scenario: z.string(),
  source: CharacterSourceFormatSchema,
  systemPrompt: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string().min(1),
});
export type CharacterDetailDto = z.infer<typeof CharacterDetailDtoSchema>;

export const CharacterDetailResponseSchema = z.object({
  character: CharacterDetailDtoSchema,
});
export type CharacterDetailResponse = z.infer<typeof CharacterDetailResponseSchema>;

export const SaveCharacterCommandSchema = z.object({
  description: z.string().max(20_000).default(''),
  exampleDialogue: z.string().max(20_000).default(''),
  firstMessage: z.string().max(20_000).default(''),
  name: z.string().trim().min(1).max(200),
  personality: z.string().max(5_000).default(''),
  scenario: z.string().max(5_000).default(''),
  systemPrompt: z.string().max(20_000).default(''),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
});
export type SaveCharacterCommand = z.infer<typeof SaveCharacterCommandSchema>;
