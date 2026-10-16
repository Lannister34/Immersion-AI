import { GenerationJobIdSchema } from '@immersion/contracts/generation';
import { z } from 'zod';

export const CancelGenerationJobCommandSchema = z.object({
  jobId: GenerationJobIdSchema,
});

export type CancelGenerationJobCommand = z.infer<typeof CancelGenerationJobCommandSchema>;
