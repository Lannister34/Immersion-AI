import { LorebookIdSchema } from '@immersion/contracts/lorebooks';
import { z } from 'zod';

export const LorebookRouteParamsSchema = z.object({
  lorebookId: LorebookIdSchema,
});
