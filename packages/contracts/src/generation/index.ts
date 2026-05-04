import { z } from 'zod';

import { ChatIdSchema, ChatMessageRoleSchema, ChatSessionDtoSchema } from '../chats/index.js';
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

export const GenerationReadinessResponseSchema = z.object({
  activeProvider: ProviderTypeSchema,
  issue: GenerationReadinessIssueSchema.nullable(),
  mode: ProviderModeSchema,
  runtime: GenerationReadinessRuntimeSchema.nullable(),
  status: GenerationReadinessStatusSchema,
});
export type GenerationReadinessResponse = z.infer<typeof GenerationReadinessResponseSchema>;

export const StartChatReplyGenerationCommandSchema = z.object({
  chatId: ChatIdSchema,
  message: z.string().trim().min(1).max(20_000),
});
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

export const ChatReplyPromptPreviewCommandSchema = z.object({
  chatId: ChatIdSchema,
  draftUserMessage: z.string().trim().min(1).max(20_000).optional(),
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
