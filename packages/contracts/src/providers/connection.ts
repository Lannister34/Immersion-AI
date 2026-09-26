import { z } from 'zod';

import { ProviderModeSchema, ProviderTypeSchema } from './settings.js';

export const ProviderConnectionStatusSchema = z.enum(['error', 'ok']);
export type ProviderConnectionStatus = z.infer<typeof ProviderConnectionStatusSchema>;

export const ProviderConnectionIssueCodeSchema = z.enum([
  'builtin_runtime_not_running',
  'provider_api_key_missing',
  'provider_http_error',
  'provider_invalid_response',
  'provider_unreachable',
  'provider_url_invalid',
  'provider_url_missing',
]);
export type ProviderConnectionIssueCode = z.infer<typeof ProviderConnectionIssueCodeSchema>;

export const ProviderConnectionIssueSchema = z.object({
  code: ProviderConnectionIssueCodeSchema,
  message: z.string().min(1),
});
export type ProviderConnectionIssue = z.infer<typeof ProviderConnectionIssueSchema>;

export const ProviderModelSummarySchema = z.object({
  id: z.string().min(1),
});
export type ProviderModelSummary = z.infer<typeof ProviderModelSummarySchema>;

export const ProviderModelsProbeCommandSchema = z.object({
  apiKey: z.string().max(500).optional(),
  provider: ProviderTypeSchema,
  url: z.string().min(1).max(2000),
});
export type ProviderModelsProbeCommand = z.infer<typeof ProviderModelsProbeCommandSchema>;

export const ProviderConnectionResponseSchema = z.object({
  activeProvider: ProviderTypeSchema,
  endpoint: z.string().nullable(),
  issue: ProviderConnectionIssueSchema.nullable(),
  mode: ProviderModeSchema,
  models: z.array(ProviderModelSummarySchema),
  status: ProviderConnectionStatusSchema,
});
export type ProviderConnectionResponse = z.infer<typeof ProviderConnectionResponseSchema>;
