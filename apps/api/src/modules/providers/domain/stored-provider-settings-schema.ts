import { ProviderConfigsSchema, ProviderModeSchema, ProviderTypeSchema } from '@immersion/contracts/providers';
import { z } from 'zod';

export const storedProviderSettingsSchema = z
  .object({
    backendMode: ProviderModeSchema.optional(),
    activeProvider: ProviderTypeSchema.optional(),
    providerConfigs: ProviderConfigsSchema.optional(),
    connectionPresets: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          provider: ProviderTypeSchema.optional(),
          url: z.string().min(1).optional(),
          apiKey: z.string().min(1).optional(),
          model: z.string().min(1).optional(),
        }),
      )
      .optional(),
    activeConnectionPresetId: z.string().min(1).optional(),
  })
  .passthrough();
