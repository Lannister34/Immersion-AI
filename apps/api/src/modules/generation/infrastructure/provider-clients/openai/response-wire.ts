import { z } from 'zod';

export const OpenAiStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
            reasoning: z.string().nullable().optional(),
            reasoning_content: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .min(1),
});

export const OpenAiStreamErrorSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().optional() })]),
});

export const OpenAiChatCompletionReplySchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          reasoning_content: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
});

export type OpenAiChatCompletionReply = z.infer<typeof OpenAiChatCompletionReplySchema>;
