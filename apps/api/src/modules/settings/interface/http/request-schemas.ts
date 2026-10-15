import { z } from 'zod';

export const PresetRouteParamsSchema = z.object({
  presetId: z.string().trim().min(1),
});

export const ModelBindingRouteParamsSchema = z.object({
  modelName: z.string().trim().min(1),
});
