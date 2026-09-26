import { z } from 'zod';

export const RuntimeServerStatusSchema = z.enum(['idle', 'starting', 'running', 'stopping', 'error']);

export const RuntimeEngineInfoSchema = z.object({
  found: z.boolean(),
  executablePath: z.string().nullable(),
  defaultModelsDir: z.string(),
});

export const RuntimeStatusSnapshotSchema = z.object({
  status: RuntimeServerStatusSchema,
  model: z.string().nullable(),
  modelPath: z.string().nullable(),
  error: z.string().nullable(),
  port: z.number().int().nonnegative(),
  pid: z.number().int().positive().nullable(),
});

export const RuntimeConfigSnapshotSchema = z.object({
  modelsDirs: z.array(z.string().trim().min(1)),
  port: z.number().int().nonnegative(),
  gpuLayers: z.number().int(),
  contextSize: z.number().int().positive(),
  flashAttention: z.boolean(),
  threads: z.number().int().nonnegative(),
});

export const RuntimeModelSummarySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  size: z.number().nonnegative(),
  sourceDirectory: z.string().min(1),
  visionProjectorPath: z.string().min(1).nullable(),
});

export const RuntimeModelsDirStatusSchema = z.object({
  path: z.string().min(1),
  exists: z.boolean(),
});

export const RuntimeOverviewResponseSchema = z.object({
  engine: RuntimeEngineInfoSchema,
  serverStatus: RuntimeStatusSnapshotSchema,
  serverConfig: RuntimeConfigSnapshotSchema,
  models: z.array(RuntimeModelSummarySchema),
  modelsDirsStatus: z.array(RuntimeModelsDirStatusSchema),
});

export type RuntimeServerStatus = z.infer<typeof RuntimeServerStatusSchema>;
export type RuntimeEngineInfo = z.infer<typeof RuntimeEngineInfoSchema>;
export type RuntimeStatusSnapshot = z.infer<typeof RuntimeStatusSnapshotSchema>;
export type RuntimeConfigSnapshot = z.infer<typeof RuntimeConfigSnapshotSchema>;
export type RuntimeModelSummary = z.infer<typeof RuntimeModelSummarySchema>;
export type RuntimeModelsDirStatus = z.infer<typeof RuntimeModelsDirStatusSchema>;
export type RuntimeOverviewResponse = z.infer<typeof RuntimeOverviewResponseSchema>;
