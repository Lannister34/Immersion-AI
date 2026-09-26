import { z } from 'zod';

import {
  ChatAttachmentIdSchema,
  ChatIdSchema,
  ChatMessageRoleSchema,
  ChatSessionDtoSchema,
  ChatSummaryDtoSchema,
} from '../chats/index.js';
import { ApiProblemSchema } from '../common/index.js';
import { ProviderModeSchema, ProviderTypeSchema } from '../providers/settings.js';
import { RuntimeServerStatusSchema } from '../runtime/overview.js';

export const GenerationReadinessStatusSchema = z.enum(['blocked', 'ready']);
export type GenerationReadinessStatus = z.infer<typeof GenerationReadinessStatusSchema>;

export const GenerationReadinessIssueCodeSchema = z.enum([
  'builtin_no_models',
  'builtin_runtime_error',
  'builtin_runtime_not_installed',
  'builtin_runtime_not_running',
  'builtin_runtime_starting',
  'builtin_runtime_stopping',
  'external_provider_api_key_missing',
  'external_provider_model_missing',
  'external_provider_url_invalid',
  'external_provider_url_missing',
]);
export type GenerationReadinessIssueCode = z.infer<typeof GenerationReadinessIssueCodeSchema>;

export const GenerationReadinessIssueSchema = z.object({
  code: GenerationReadinessIssueCodeSchema,
  message: z.string().min(1),
});
export type GenerationReadinessIssue = z.infer<typeof GenerationReadinessIssueSchema>;

export const GenerationReadinessRuntimeSchema = z.object({
  model: z.string().nullable(),
  port: z.number().int().nonnegative(),
  status: RuntimeServerStatusSchema,
});
export type GenerationReadinessRuntime = z.infer<typeof GenerationReadinessRuntimeSchema>;

/** Принимает ли активная модель изображения; unknown — сервер не сообщает. */
export const VisionSupportSchema = z.enum(['supported', 'unknown', 'unsupported']);
export type VisionSupport = z.infer<typeof VisionSupportSchema>;

export const GenerationReadinessResponseSchema = z.object({
  activeProvider: ProviderTypeSchema,
  issue: GenerationReadinessIssueSchema.nullable(),
  mode: ProviderModeSchema,
  runtime: GenerationReadinessRuntimeSchema.nullable(),
  status: GenerationReadinessStatusSchema,
  visionSupport: VisionSupportSchema,
});
export type GenerationReadinessResponse = z.infer<typeof GenerationReadinessResponseSchema>;

export const ChatReplyGenerationModeSchema = z.enum(['reply', 'continue']);
export type ChatReplyGenerationMode = z.infer<typeof ChatReplyGenerationModeSchema>;

export const StartChatReplyCommandSchema = z.object({
  /** Ранее загруженные вложения этого чата; модель получит их вместе с текстом. */
  attachmentIds: z.array(ChatAttachmentIdSchema).max(4).optional(),
  chatId: ChatIdSchema,
  message: z.string().trim().min(1).max(20_000),
  mode: z.literal('reply').default('reply'),
});
export type StartChatReplyCommand = z.infer<typeof StartChatReplyCommandSchema>;

export const ContinueChatReplyCommandSchema = z.object({
  chatId: ChatIdSchema,
  mode: z.literal('continue'),
});
export type ContinueChatReplyCommand = z.infer<typeof ContinueChatReplyCommandSchema>;

/** Ответ на уже существующее последнее сообщение пользователя: новое сообщение не добавляется. */
export const AnswerChatReplyCommandSchema = z.object({
  chatId: ChatIdSchema,
  mode: z.literal('answer'),
});
export type AnswerChatReplyCommand = z.infer<typeof AnswerChatReplyCommandSchema>;

export const StartChatReplyGenerationCommandSchema = z.union([
  StartChatReplyCommandSchema,
  ContinueChatReplyCommandSchema,
  AnswerChatReplyCommandSchema,
]);
export type StartChatReplyGenerationCommand = z.infer<typeof StartChatReplyGenerationCommandSchema>;

export const RegenerateChatReplyCommandSchema = z.object({
  chatId: ChatIdSchema,
});
export type RegenerateChatReplyCommand = z.infer<typeof RegenerateChatReplyCommandSchema>;

export const ChatReplyGenerationResponseSchema = z.object({
  session: ChatSessionDtoSchema,
});
export type ChatReplyGenerationResponse = z.infer<typeof ChatReplyGenerationResponseSchema>;

export const ChatReplyGenerationErrorResponseSchema = ApiProblemSchema.extend({
  session: ChatSessionDtoSchema,
});
export type ChatReplyGenerationErrorResponse = z.infer<typeof ChatReplyGenerationErrorResponseSchema>;

export const ChatReplyPromptPreviewMessageOverrideSchema = z.object({
  content: z.string().min(1).max(20_000),
  messageIndex: z.number().int().positive(),
});
export type ChatReplyPromptPreviewMessageOverride = z.infer<typeof ChatReplyPromptPreviewMessageOverrideSchema>;

export const ChatReplyPromptPreviewCommandSchema = z.object({
  chatId: ChatIdSchema,
  draftUserMessage: z.string().trim().min(1).max(20_000).optional(),
  messageOverrides: z.array(ChatReplyPromptPreviewMessageOverrideSchema).optional(),
});
export type ChatReplyPromptPreviewCommand = z.infer<typeof ChatReplyPromptPreviewCommandSchema>;

export const ChatReplyPromptPreviewMessageSchema = z.object({
  content: z.string(),
  role: ChatMessageRoleSchema,
});
export type ChatReplyPromptPreviewMessage = z.infer<typeof ChatReplyPromptPreviewMessageSchema>;

export const ChatReplyPromptPreviewSamplingSchema = z.object({
  contextTrimStrategy: z.enum(['trim_middle', 'trim_start']),
  maxContextLength: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive(),
  minP: z.number().nonnegative(),
  presencePenalty: z.number(),
  repeatPenalty: z.number().nonnegative(),
  repeatPenaltyRange: z.number().int().nonnegative(),
  temperature: z.number().nonnegative(),
  topK: z.number().int().nonnegative(),
  topP: z.number().nonnegative(),
});
export type ChatReplyPromptPreviewSampling = z.infer<typeof ChatReplyPromptPreviewSamplingSchema>;

export const ChatReplyPromptPreviewProviderSamplingSchema = ChatReplyPromptPreviewSamplingSchema.omit({
  contextTrimStrategy: true,
  maxContextLength: true,
  maxTokens: true,
});
export type ChatReplyPromptPreviewProviderSampling = z.infer<typeof ChatReplyPromptPreviewProviderSamplingSchema>;

export const ChatReplyPromptPreviewOverrideFlagsSchema = z.object({
  contextTrimStrategy: z.boolean(),
  maxContextLength: z.boolean(),
  maxTokens: z.boolean(),
  minP: z.boolean(),
  presencePenalty: z.boolean(),
  repeatPenalty: z.boolean(),
  repeatPenaltyRange: z.boolean(),
  temperature: z.boolean(),
  topK: z.boolean(),
  topP: z.boolean(),
});
export type ChatReplyPromptPreviewOverrideFlags = z.infer<typeof ChatReplyPromptPreviewOverrideFlagsSchema>;

export const ChatReplyPromptPreviewSourceSchema = z.object({
  kind: z.enum(['chat-override', 'character-override', 'settings-template', 'default-template']),
});
export type ChatReplyPromptPreviewSource = z.infer<typeof ChatReplyPromptPreviewSourceSchema>;

export const ChatReplyPromptPreviewRendererDiagnosticsSchema = z.object({
  cyclicVariables: z.array(z.string()),
  invalidVariableTemplates: z.array(z.string()),
  unknownConditions: z.array(z.string()),
  unresolvedVariables: z.array(z.string()),
});
export type ChatReplyPromptPreviewRendererDiagnostics = z.infer<typeof ChatReplyPromptPreviewRendererDiagnosticsSchema>;

export const TokenCountMethodSchema = z.enum(['approximate', 'exact']);
export type TokenCountMethod = z.infer<typeof TokenCountMethodSchema>;

export const ChatReplyPromptPreviewTokenEstimateSchema = z.object({
  finalTotal: z.number().int().nonnegative(),
  promptBudget: z.number().int().nonnegative(),
  replyReservation: z.number().int().nonnegative(),
  system: z.number().int().nonnegative(),
  transcriptAfterTrim: z.number().int().nonnegative(),
  transcriptBeforeTrim: z.number().int().nonnegative(),
});
export type ChatReplyPromptPreviewTokenEstimate = z.infer<typeof ChatReplyPromptPreviewTokenEstimateSchema>;

export const ChatReplyPromptPreviewResponseSchema = z.object({
  chatId: ChatIdSchema,
  diagnostics: z.object({
    messageCount: z.number().int().nonnegative(),
    promptSource: ChatReplyPromptPreviewSourceSchema,
    renderer: ChatReplyPromptPreviewRendererDiagnosticsSchema,
    systemPromptIncluded: z.boolean(),
    systemMessageCount: z.number().int().nonnegative(),
    tokenCountMethod: TokenCountMethodSchema,
    tokenEstimate: ChatReplyPromptPreviewTokenEstimateSchema,
    transcriptMessageCount: z.number().int().nonnegative(),
    trimmedMessageCount: z.number().int().nonnegative(),
  }),
  effectiveSettings: z.object({
    appliedChatOverrides: ChatReplyPromptPreviewOverrideFlagsSchema,
    ignoredChatSamplerPresetId: z.string().nullable(),
    modelBindingPresetId: z.string().nullable(),
    modelName: z.string().nullable(),
    samplerPresetId: z.string().min(1),
    samplerPresetName: z.string().min(1),
    samplerPresetSource: z.enum(['active_preset', 'chat_preset', 'model_binding']),
    sampling: ChatReplyPromptPreviewSamplingSchema,
  }),
  provider: z.object({
    model: z.string().nullable(),
    readiness: GenerationReadinessResponseSchema,
  }),
  request: z.object({
    maxTokens: z.number().int().positive(),
    messages: z.array(ChatReplyPromptPreviewMessageSchema),
    sampling: ChatReplyPromptPreviewProviderSamplingSchema,
  }),
});
export type ChatReplyPromptPreviewResponse = z.infer<typeof ChatReplyPromptPreviewResponseSchema>;

export const GenerateChatTitleCommandSchema = z.object({
  chatId: ChatIdSchema,
});
export type GenerateChatTitleCommand = z.infer<typeof GenerateChatTitleCommandSchema>;

export const GenerateChatTitleResponseSchema = z.object({
  chat: ChatSummaryDtoSchema,
  title: z.string().min(1).max(120),
});
export type GenerateChatTitleResponse = z.infer<typeof GenerateChatTitleResponseSchema>;

export const GenerateFirstMessageCommandSchema = z.object({
  chatId: ChatIdSchema,
});
export type GenerateFirstMessageCommand = z.infer<typeof GenerateFirstMessageCommandSchema>;

export const GenerateFirstMessageResponseSchema = z.object({
  session: ChatSessionDtoSchema,
});
export type GenerateFirstMessageResponse = z.infer<typeof GenerateFirstMessageResponseSchema>;

export const CharacterDraftFieldNameSchema = z.enum([
  'description',
  'exampleDialogue',
  'firstMessage',
  'name',
  'personality',
  'scenario',
]);
export type CharacterDraftFieldName = z.infer<typeof CharacterDraftFieldNameSchema>;

export const CharacterDraftFieldsSchema = z
  .object({
    description: z.string().max(20_000),
    exampleDialogue: z.string().max(20_000),
    firstMessage: z.string().max(20_000),
    name: z.string().max(200),
    personality: z.string().max(5_000),
    scenario: z.string().max(5_000),
  })
  .partial();
export type CharacterDraftFields = z.infer<typeof CharacterDraftFieldsSchema>;

export const GenerateCharacterDraftCommandSchema = z.object({
  concept: z.string().trim().min(1).max(2_000),
  fields: CharacterDraftFieldsSchema.optional(),
});
export type GenerateCharacterDraftCommand = z.infer<typeof GenerateCharacterDraftCommandSchema>;

export const GenerateCharacterDraftResponseSchema = z.object({
  description: z.string().max(20_000),
  exampleDialogue: z.string().max(20_000),
  firstMessage: z.string().max(20_000),
  name: z.string().min(1).max(200),
  personality: z.string().max(5_000),
  scenario: z.string().max(5_000),
  tags: z.array(z.string().min(1).max(60)).max(50),
});
export type GenerateCharacterDraftResponse = z.infer<typeof GenerateCharacterDraftResponseSchema>;

export const GenerateCharacterFieldCommandSchema = z.object({
  concept: z.string().trim().max(2_000).optional(),
  current: CharacterDraftFieldsSchema.default({}),
  field: CharacterDraftFieldNameSchema,
});
export type GenerateCharacterFieldCommand = z.infer<typeof GenerateCharacterFieldCommandSchema>;

export const GenerateCharacterFieldResponseSchema = z.object({
  value: z.string().min(1).max(20_000),
});
export type GenerateCharacterFieldResponse = z.infer<typeof GenerateCharacterFieldResponseSchema>;

export const GenerateCharacterAvatarPromptCommandSchema = z.object({
  card: CharacterDraftFieldsSchema.default({}),
});
export type GenerateCharacterAvatarPromptCommand = z.infer<typeof GenerateCharacterAvatarPromptCommandSchema>;

export const GenerateCharacterAvatarPromptResponseSchema = z.object({
  prompt: z.string().min(1).max(2_000),
});
export type GenerateCharacterAvatarPromptResponse = z.infer<typeof GenerateCharacterAvatarPromptResponseSchema>;

export const GenerateScenarioDraftCommandSchema = z.object({
  concept: z.string().trim().min(1).max(2_000),
  name: z.string().trim().min(1).max(200).optional(),
});
export type GenerateScenarioDraftCommand = z.infer<typeof GenerateScenarioDraftCommandSchema>;

export const GenerateScenarioDraftResponseSchema = z.object({
  content: z.string().min(1).max(20_000),
  firstMessage: z.string().max(20_000),
  name: z.string().min(1).max(200),
  tags: z.array(z.string().min(1).max(60)).max(50),
});
export type GenerateScenarioDraftResponse = z.infer<typeof GenerateScenarioDraftResponseSchema>;

export const GenerateScenarioFirstMessageCommandSchema = z.object({
  concept: z.string().trim().min(1).max(2_000),
  content: z.string().trim().max(20_000).optional(),
  name: z.string().trim().min(1).max(200).optional(),
});
export type GenerateScenarioFirstMessageCommand = z.infer<typeof GenerateScenarioFirstMessageCommandSchema>;

export const GenerateScenarioFirstMessageResponseSchema = z.object({
  value: z.string().min(1).max(20_000),
});
export type GenerateScenarioFirstMessageResponse = z.infer<typeof GenerateScenarioFirstMessageResponseSchema>;

export const GeneratedLorebookEntryDraftSchema = z.object({
  comment: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20_000),
  keys: z.array(z.string().min(1).max(200)).max(100),
});
export type GeneratedLorebookEntryDraft = z.infer<typeof GeneratedLorebookEntryDraftSchema>;

export const GenerateLorebookDraftCommandSchema = z.object({
  concept: z.string().trim().min(1).max(2_000),
  entryCount: z.number().int().min(1).max(20).default(8),
});
export type GenerateLorebookDraftCommand = z.infer<typeof GenerateLorebookDraftCommandSchema>;

export const GenerateLorebookDraftResponseSchema = z.object({
  entries: z.array(GeneratedLorebookEntryDraftSchema).min(1).max(20),
  name: z.string().min(1).max(200),
});
export type GenerateLorebookDraftResponse = z.infer<typeof GenerateLorebookDraftResponseSchema>;

export const GenerationJobIdSchema = z.string().uuid();
export type GenerationJobId = z.infer<typeof GenerationJobIdSchema>;

export const GenerationJobKindSchema = z.literal('chat_reply');
export type GenerationJobKind = z.infer<typeof GenerationJobKindSchema>;

export const GenerationJobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed', 'canceled']);
export type GenerationJobStatus = z.infer<typeof GenerationJobStatusSchema>;

export const GenerationJobDtoSchema = z.object({
  chatId: ChatIdSchema,
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  error: ApiProblemSchema.nullable(),
  id: GenerationJobIdSchema,
  kind: GenerationJobKindSchema,
  startedAt: z.string().datetime().nullable(),
  status: GenerationJobStatusSchema,
  updatedAt: z.string().datetime(),
});
export type GenerationJobDto = z.infer<typeof GenerationJobDtoSchema>;

export const StartChatReplyGenerationJobResponseSchema = z.object({
  job: GenerationJobDtoSchema,
  session: ChatSessionDtoSchema,
});
export type StartChatReplyGenerationJobResponse = z.infer<typeof StartChatReplyGenerationJobResponseSchema>;

export const ListGenerationJobsResponseSchema = z.object({
  items: z.array(GenerationJobDtoSchema),
});
export type ListGenerationJobsResponse = z.infer<typeof ListGenerationJobsResponseSchema>;

export const GenerationJobResponseSchema = z.object({
  job: GenerationJobDtoSchema,
});
export type GenerationJobResponse = z.infer<typeof GenerationJobResponseSchema>;

export const GenerationJobEventSchema = z.discriminatedUnion('type', [
  z.object({
    channel: z.enum(['reasoning', 'reply']),
    delta: z.string(),
    job: GenerationJobDtoSchema,
    type: z.literal('chat.reply.delta'),
  }),
  z.object({
    job: GenerationJobDtoSchema,
    type: z.literal('generation.job.snapshot'),
  }),
  z.object({
    job: GenerationJobDtoSchema,
    type: z.literal('generation.job.updated'),
  }),
  z.object({
    job: GenerationJobDtoSchema,
    session: ChatSessionDtoSchema,
    type: z.literal('chat.session.updated'),
  }),
]);
export type GenerationJobEvent = z.infer<typeof GenerationJobEventSchema>;
