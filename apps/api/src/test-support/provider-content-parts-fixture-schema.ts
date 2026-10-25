import { z } from 'zod';

export const ProviderContentPartsFixtureSchema = z.array(
  z.looseObject({
    type: z.string(),
    text: z.string().optional(),
    image_url: z.looseObject({ url: z.string() }).optional(),
  }),
);

export type ProviderContentPartsFixture = z.infer<typeof ProviderContentPartsFixtureSchema>;
