import { z } from 'zod';

import { RuntimeServerStatusSchema } from './overview.js';

export const RuntimeLogsResponseSchema = z.object({
  lines: z.array(z.string()),
  status: RuntimeServerStatusSchema,
});
export type RuntimeLogsResponse = z.infer<typeof RuntimeLogsResponseSchema>;
