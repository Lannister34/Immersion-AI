import { ScenarioIdSchema } from '@immersion/contracts/scenarios';
import { z } from 'zod';

export const ScenarioRouteParamsSchema = z.object({
  scenarioId: ScenarioIdSchema,
});
