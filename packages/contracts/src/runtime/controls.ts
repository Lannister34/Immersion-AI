import { z } from 'zod';

import { RuntimeConfigSnapshotSchema } from './overview.js';

export const RuntimeConfigCommandSchema = RuntimeConfigSnapshotSchema;
export type RuntimeConfigCommand = z.infer<typeof RuntimeConfigCommandSchema>;

export const RuntimeStartCommandSchema = RuntimeConfigCommandSchema.omit({
  modelsDirs: true,
}).extend({
  mmprojPath: z.string().min(1).optional(),
  modelPath: z.string().min(1),
});
export type RuntimeStartCommand = z.infer<typeof RuntimeStartCommandSchema>;

export const PickRuntimeDirectoryCommandSchema = z.object({
  initialPath: z.string().max(4096).optional(),
});
export type PickRuntimeDirectoryCommand = z.infer<typeof PickRuntimeDirectoryCommandSchema>;

export const PickRuntimeDirectoryResponseSchema = z.object({
  path: z.string().nullable(),
});
export type PickRuntimeDirectoryResponse = z.infer<typeof PickRuntimeDirectoryResponseSchema>;

export const RuntimeStopCommandSchema = z.object({});
export type RuntimeStopCommand = z.infer<typeof RuntimeStopCommandSchema>;

export const RuntimeInstallVariantSchema = z.enum(['cpu', 'cuda-12.4', 'cuda-13.1', 'vulkan']);
export type RuntimeInstallVariant = z.infer<typeof RuntimeInstallVariantSchema>;

export const RuntimeInstallCommandSchema = z.object({
  variant: RuntimeInstallVariantSchema,
});
export type RuntimeInstallCommand = z.infer<typeof RuntimeInstallCommandSchema>;
