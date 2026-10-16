import { z } from 'zod';

export const StoredChatHeaderFixtureSchema = z.looseObject({
  chat_metadata: z.looseObject({
    createdAt: z.string(),
    title: z.string(),
    updatedAt: z.string(),
  }),
  user_name: z.string(),
  character_name: z.string().optional(),
  generation_settings: z.record(z.string(), z.unknown()).optional(),
});

export type StoredChatHeaderFixture = z.infer<typeof StoredChatHeaderFixtureSchema>;

export const StoredChatMessageFixtureSchema = z.looseObject({
  is_user: z.boolean(),
  mes: z.string(),
  send_date: z.string(),
});

export type StoredChatMessageFixture = z.infer<typeof StoredChatMessageFixtureSchema>;
