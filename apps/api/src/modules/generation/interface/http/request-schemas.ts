import { ChatIdSchema } from '@immersion/contracts/chats';
import { GenerationJobIdSchema } from '@immersion/contracts/generation';
import { z } from 'zod';

export const GenerationJobRouteParamsSchema = z.object({
  jobId: GenerationJobIdSchema,
});

export const GenerationJobsQuerySchema = z.object({
  chatId: ChatIdSchema.optional(),
});
