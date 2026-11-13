import { ProviderModeSchema, ProviderTypeSchema } from '@immersion/contracts/providers';
import { z } from 'zod';

export const ProviderConfigSchema = z
  .object({
    url: z.string().min(1),
    apiKey: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  })
  .catchall(z.string().min(1));
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderConfigsSchema = z
  .object({
    koboldcpp: ProviderConfigSchema.optional(),
    custom: ProviderConfigSchema.optional(),
    openai: ProviderConfigSchema.optional(),
    anthropic: ProviderConfigSchema.optional(),
  })
  .partial();
export type ProviderConfigs = z.infer<typeof ProviderConfigsSchema>;

export const ProviderSettingsSchema = z.object({
  mode: ProviderModeSchema,
  activeProvider: ProviderTypeSchema,
  providerConfigs: ProviderConfigsSchema,
});
export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;
