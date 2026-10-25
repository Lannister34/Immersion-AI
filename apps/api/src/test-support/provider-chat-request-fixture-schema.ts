import { z } from 'zod';

const ProviderChatMessageFixtureSchema = z.looseObject({
  role: z.string(),
  content: z.union([z.string(), z.array(z.unknown())]),
});

export const ProviderChatRequestFixtureSchema = z.looseObject({
  model: z.string().optional(),
  messages: z.array(ProviderChatMessageFixtureSchema),
  stream: z.boolean().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
});

export type ProviderChatRequestFixture = z.infer<typeof ProviderChatRequestFixtureSchema>;
