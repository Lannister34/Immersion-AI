import { z } from 'zod';

export const StoredSamplerPresetFixtureSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  temperature: z.number(),
  top_p: z.number(),
  top_k: z.number(),
  min_p: z.number(),
  rep_pen: z.number(),
  rep_pen_range: z.number(),
  presence_penalty: z.number(),
  max_length: z.number(),
  max_context_length: z.number(),
  context_trim_strategy: z.enum(['trim_middle', 'trim_start']),
});

export type StoredSamplerPresetFixture = z.infer<typeof StoredSamplerPresetFixtureSchema>;

export const StoredProviderConfigFixtureSchema = z.looseObject({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
});

export const StoredLlmServerConfigFixtureSchema = z.looseObject({
  modelsDirs: z.array(z.string()).optional(),
  port: z.number().optional(),
  gpuLayers: z.number().optional(),
  contextSize: z.number().optional(),
  flashAttention: z.boolean().optional(),
  threads: z.number().optional(),
});

export const StoredUserSettingsFixtureSchema = z.looseObject({
  userName: z.string().optional(),
  userPersona: z.string().optional(),
  systemPromptTemplate: z.string().optional(),
  responseLanguage: z.string().optional(),
  streamingEnabled: z.boolean().optional(),
  thinkingEnabled: z.boolean().optional(),
  samplerPresets: z.array(StoredSamplerPresetFixtureSchema).optional(),
  activePresetId: z.string().optional(),
  modelPresetMap: z.record(z.string(), z.string()).optional(),
  backendMode: z.enum(['builtin', 'external']).optional(),
  activeProvider: z.string().optional(),
  providerConfigs: z.record(z.string(), StoredProviderConfigFixtureSchema).optional(),
  llmServerConfig: StoredLlmServerConfigFixtureSchema.optional(),
});

export type StoredUserSettingsFixture = z.infer<typeof StoredUserSettingsFixtureSchema>;
