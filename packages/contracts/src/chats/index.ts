import { z } from 'zod';

export const ChatIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
export type ChatId = z.infer<typeof ChatIdSchema>;

export const ChatMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ChatMessageRole = z.infer<typeof ChatMessageRoleSchema>;

export const ChatSummaryDtoSchema = z.object({
  id: ChatIdSchema,
  title: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  messageCount: z.number().int().nonnegative(),
  lastMessagePreview: z.string().nullable(),
  characterId: z.string().nullable(),
  characterAvatarUrl: z.string().nullable(),
  characterName: z.string().nullable(),
  scenarioId: z.string().nullable(),
  scenarioName: z.string().nullable(),
  lorebookIds: z.array(z.string()),
});
export type ChatSummaryDto = z.infer<typeof ChatSummaryDtoSchema>;

export const ChatMessageDtoSchema = z.object({
  id: z.string().min(1),
  role: ChatMessageRoleSchema,
  content: z.string(),
  createdAt: z.string().min(1),
});
export type ChatMessageDto = z.infer<typeof ChatMessageDtoSchema>;

export const ChatContextTrimStrategySchema = z.enum(['trim_middle', 'trim_start']);
export type ChatContextTrimStrategy = z.infer<typeof ChatContextTrimStrategySchema>;

export const ChatSamplingOverridesDtoSchema = z.object({
  contextTrimStrategy: ChatContextTrimStrategySchema.nullable(),
  maxContextLength: z.number().int().positive().nullable(),
  maxTokens: z.number().int().positive().nullable(),
  minP: z.number().nonnegative().nullable(),
  presencePenalty: z.number().nullable(),
  repeatPenalty: z.number().nonnegative().nullable(),
  repeatPenaltyRange: z.number().int().nonnegative().nullable(),
  temperature: z.number().nonnegative().nullable(),
  topK: z.number().int().nonnegative().nullable(),
  topP: z.number().nonnegative().nullable(),
});
export type ChatSamplingOverridesDto = z.infer<typeof ChatSamplingOverridesDtoSchema>;

export const ChatGenerationSettingsDtoSchema = z.object({
  samplerPresetId: z.string().min(1).nullable(),
  sampling: ChatSamplingOverridesDtoSchema,
  systemPrompt: z.string().max(20_000).nullable(),
});
export type ChatGenerationSettingsDto = z.infer<typeof ChatGenerationSettingsDtoSchema>;

export const ChatSessionDtoSchema = z.object({
  chat: ChatSummaryDtoSchema,
  userName: z.string(),
  characterId: z.string().nullable(),
  characterName: z.string().nullable(),
  characterAvatarUrl: z.string().nullable(),
  scenarioId: z.string().nullable(),
  scenarioName: z.string().nullable(),
  lorebookIds: z.array(z.string()),
  generationSettings: ChatGenerationSettingsDtoSchema,
  messages: z.array(ChatMessageDtoSchema),
});
export type ChatSessionDto = z.infer<typeof ChatSessionDtoSchema>;

export const ChatListResponseSchema = z.object({
  items: z.array(ChatSummaryDtoSchema),
});
export type ChatListResponse = z.infer<typeof ChatListResponseSchema>;

export const CreateChatCommandSchema = z.object({
  characterId: z.string().trim().min(1).max(200).optional(),
  scenarioId: z.string().trim().min(1).max(200).optional(),
  lorebookIds: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  title: z.string().trim().min(1).max(120).optional(),
});
export type CreateChatCommand = z.infer<typeof CreateChatCommandSchema>;

export const UpdateChatLorebooksCommandSchema = z.object({
  lorebookIds: z.array(z.string().trim().min(1).max(200)).max(20),
});
export type UpdateChatLorebooksCommand = z.infer<typeof UpdateChatLorebooksCommandSchema>;

export const UpdateChatTitleCommandSchema = z.object({
  title: z.string().trim().min(1).max(120),
});
export type UpdateChatTitleCommand = z.infer<typeof UpdateChatTitleCommandSchema>;

export const UpdateChatTitleResponseSchema = z.object({
  chat: ChatSummaryDtoSchema,
});
export type UpdateChatTitleResponse = z.infer<typeof UpdateChatTitleResponseSchema>;

export const UpdateChatBindingsCommandSchema = z.object({
  characterId: z.string().trim().min(1).max(200).nullable().optional(),
  scenarioId: z.string().trim().min(1).max(200).nullable().optional(),
});
export type UpdateChatBindingsCommand = z.infer<typeof UpdateChatBindingsCommandSchema>;

export const UpdateChatBindingsResponseSchema = ChatSessionDtoSchema;
export type UpdateChatBindingsResponse = z.infer<typeof UpdateChatBindingsResponseSchema>;

export const CreateChatResponseSchema = z.object({
  chat: ChatSummaryDtoSchema,
});
export type CreateChatResponse = z.infer<typeof CreateChatResponseSchema>;

export const GetChatSessionResponseSchema = ChatSessionDtoSchema;
export type GetChatSessionResponse = z.infer<typeof GetChatSessionResponseSchema>;

export const UpdateChatGenerationSettingsCommandSchema = ChatGenerationSettingsDtoSchema;
export type UpdateChatGenerationSettingsCommand = z.infer<typeof UpdateChatGenerationSettingsCommandSchema>;

export const UpdateChatGenerationSettingsResponseSchema = ChatSessionDtoSchema;
export type UpdateChatGenerationSettingsResponse = z.infer<typeof UpdateChatGenerationSettingsResponseSchema>;

export const UpdateChatMessageCommandSchema = z.object({
  content: z.string().min(1).max(20_000),
});
export type UpdateChatMessageCommand = z.infer<typeof UpdateChatMessageCommandSchema>;

export const ChatMessageMutationResponseSchema = z.object({
  session: ChatSessionDtoSchema,
});
export type ChatMessageMutationResponse = z.infer<typeof ChatMessageMutationResponseSchema>;

export const BranchChatCommandSchema = z.object({
  throughMessageIndex: z.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
});
export type BranchChatCommand = z.infer<typeof BranchChatCommandSchema>;

export const BranchChatResponseSchema = z.object({
  chat: ChatSummaryDtoSchema,
});
export type BranchChatResponse = z.infer<typeof BranchChatResponseSchema>;
