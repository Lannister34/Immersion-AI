import { z } from 'zod';

export const ComfyUiRuntimeOverviewFixtureSchema = z.looseObject({
  models: z.array(
    z.looseObject({
      name: z.string(),
      path: z.string(),
      visionProjectorPath: z.string().nullable(),
    }),
  ),
  serverStatus: z.looseObject({
    status: z.string(),
    modelPath: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

export const ComfyUiGenerationReadinessFixtureSchema = z.looseObject({
  mode: z.string(),
  visionSupport: z.string(),
});
