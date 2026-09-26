import { z } from 'zod';

export const ProviderTypeSchema = z.enum(['koboldcpp', 'custom', 'openai', 'anthropic']);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ProviderApiKindSchema = z.enum(['anthropic', 'openai-cloud', 'openai-compatible']);
export type ProviderApiKind = z.infer<typeof ProviderApiKindSchema>;

export const ProviderModeSchema = z.enum(['builtin', 'external']);
export type ProviderMode = z.infer<typeof ProviderModeSchema>;

export const ProviderFieldTypeSchema = z.enum(['text', 'password']);

export const ProviderFieldSchema = z.object({
  key: z.string().min(1),
  type: ProviderFieldTypeSchema,
  required: z.boolean(),
  placeholder: z.string().min(1).optional(),
  defaultValue: z.string().min(1).optional(),
});
export type ProviderField = z.infer<typeof ProviderFieldSchema>;

export const ProviderDefinitionSchema = z.object({
  apiKind: ProviderApiKindSchema,
  type: ProviderTypeSchema,
  label: z.string().min(1),
  fields: z.array(ProviderFieldSchema),
});
export type ProviderDefinition = z.infer<typeof ProviderDefinitionSchema>;

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

export const UpdateProviderSettingsCommandSchema = z.object({
  mode: ProviderModeSchema,
  activeProvider: ProviderTypeSchema,
  providerConfigs: ProviderConfigsSchema,
});
export type UpdateProviderSettingsCommand = z.infer<typeof UpdateProviderSettingsCommandSchema>;

export const PatchProviderSettingsCommandSchema = z
  .object({
    activeProvider: ProviderTypeSchema.optional(),
    config: z
      .object({
        apiKey: z.string().max(500).optional(),
        model: z.string().trim().min(1).max(200).optional(),
        url: z.string().trim().min(1).max(2000).optional(),
      })
      .optional(),
    mode: ProviderModeSchema.optional(),
  })
  .refine((command) => Object.keys(command).length > 0, {
    message: 'Patch must change at least one field.',
  });
export type PatchProviderSettingsCommand = z.infer<typeof PatchProviderSettingsCommandSchema>;

export const ProviderSettingsSnapshotSchema = UpdateProviderSettingsCommandSchema.extend({
  providerDefinitions: z.array(ProviderDefinitionSchema),
});
export type ProviderSettingsSnapshot = z.infer<typeof ProviderSettingsSnapshotSchema>;
