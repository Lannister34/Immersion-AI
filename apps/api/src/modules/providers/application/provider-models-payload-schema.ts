import { z } from 'zod';

export const ProviderModelsPayloadSchema = z
  .object({
    data: z.array(
      z
        .object({
          id: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();
