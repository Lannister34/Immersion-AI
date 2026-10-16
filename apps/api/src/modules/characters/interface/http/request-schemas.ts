import { CharacterIdSchema } from '@immersion/contracts/characters';
import { z } from 'zod';

export const CharacterRouteParamsSchema = z.object({
  characterId: CharacterIdSchema,
});
