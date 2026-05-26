import { z } from 'zod';

export const UiLanguageSchema = z.enum(['ru', 'en']);
export const ResponseLanguageSchema = z.enum(['ru', 'en', 'none']);
export const ContextTrimStrategySchema = z.enum(['trim_middle', 'trim_start']);

export const SettingsProfileSchema = z.object({
  userName: z.string(),
  userPersona: z.string(),
  systemPromptTemplate: z.string(),
  uiLanguage: UiLanguageSchema,
  responseLanguage: ResponseLanguageSchema,
  streamingEnabled: z.boolean(),
  thinkingEnabled: z.boolean(),
});

export const SamplerPresetSummarySchema = z.object({
  contextTrimStrategy: ContextTrimStrategySchema,
  id: z.string(),
  maxContextLength: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive(),
  minP: z.number().nonnegative(),
  name: z.string(),
  presencePenalty: z.number(),
  repeatPenalty: z.number().nonnegative(),
  repeatPenaltyRange: z.number().int().nonnegative(),
  temperature: z.number().nonnegative(),
  topK: z.number().int().nonnegative(),
  topP: z.number().nonnegative(),
});

export const ModelPresetBindingDtoSchema = z.object({
  modelName: z.string().min(1),
  presetId: z.string().min(1),
});

export const SettingsSamplerOverviewSchema = z.object({
  activePresetId: z.string(),
  modelBindings: z.array(ModelPresetBindingDtoSchema),
  presets: z.array(SamplerPresetSummarySchema),
  modelBindingCount: z.number().int().nonnegative(),
});

export const SettingsOverviewResponseSchema = z.object({
  profile: SettingsProfileSchema,
  sampler: SettingsSamplerOverviewSchema,
});

export type SettingsOverviewResponse = z.infer<typeof SettingsOverviewResponseSchema>;

export const UpdateSettingsProfileCommandSchema = z.object({
  userName: z.string().trim().min(1).max(120),
  userPersona: z.string().max(20_000),
  systemPromptTemplate: z.string().max(20_000),
  uiLanguage: UiLanguageSchema,
  responseLanguage: ResponseLanguageSchema,
  streamingEnabled: z.boolean(),
  thinkingEnabled: z.boolean(),
});

export type UpdateSettingsProfileCommand = z.infer<typeof UpdateSettingsProfileCommandSchema>;

export const UpdateSettingsProfileResponseSchema = z.object({
  profile: SettingsProfileSchema,
});

export type UpdateSettingsProfileResponse = z.infer<typeof UpdateSettingsProfileResponseSchema>;

export const SamplerPresetInputSchema = z.object({
  contextTrimStrategy: ContextTrimStrategySchema,
  maxContextLength: z.number().int().nonnegative().max(10_000_000),
  maxTokens: z.number().int().positive().max(10_000_000),
  minP: z.number().nonnegative().max(1),
  name: z.string().trim().min(1).max(120),
  presencePenalty: z.number().min(-5).max(5),
  repeatPenalty: z.number().nonnegative().max(10),
  repeatPenaltyRange: z.number().int().nonnegative().max(10_000_000),
  temperature: z.number().nonnegative().max(10),
  topK: z.number().int().nonnegative().max(10_000),
  topP: z.number().nonnegative().max(1),
});

export type SamplerPresetInput = z.infer<typeof SamplerPresetInputSchema>;

export const CreateSamplerPresetCommandSchema = SamplerPresetInputSchema;
export type CreateSamplerPresetCommand = z.infer<typeof CreateSamplerPresetCommandSchema>;

export const UpdateSamplerPresetCommandSchema = SamplerPresetInputSchema;
export type UpdateSamplerPresetCommand = z.infer<typeof UpdateSamplerPresetCommandSchema>;

export const SamplerPresetMutationResponseSchema = z.object({
  preset: SamplerPresetSummarySchema,
  sampler: SettingsSamplerOverviewSchema,
});

export type SamplerPresetMutationResponse = z.infer<typeof SamplerPresetMutationResponseSchema>;

export const DeleteSamplerPresetResponseSchema = z.object({
  sampler: SettingsSamplerOverviewSchema,
});

export type DeleteSamplerPresetResponse = z.infer<typeof DeleteSamplerPresetResponseSchema>;

export const SetActiveSamplerPresetCommandSchema = z.object({
  presetId: z.string().min(1),
});

export type SetActiveSamplerPresetCommand = z.infer<typeof SetActiveSamplerPresetCommandSchema>;

export const SetActiveSamplerPresetResponseSchema = z.object({
  sampler: SettingsSamplerOverviewSchema,
});

export type SetActiveSamplerPresetResponse = z.infer<typeof SetActiveSamplerPresetResponseSchema>;
