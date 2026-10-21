import { type GenerationJobResponse, GenerationJobResponseSchema } from '@immersion/contracts/generation';
import { z } from 'zod';

import { apiPost } from '../../../shared/api/client';
import { type CancelGenerationJobCommand, CancelGenerationJobCommandSchema } from './cancel-generation-job-command';

export function cancelGenerationJob(command: CancelGenerationJobCommand): Promise<GenerationJobResponse> {
  const payload = CancelGenerationJobCommandSchema.parse(command);

  return apiPost(
    `/api/generation/jobs/${encodeURIComponent(payload.jobId)}/cancel`,
    {},
    z.object({}),
    GenerationJobResponseSchema,
  );
}
