import { z } from 'zod';

export const OpenAiCompatibleStreamChunkSchema = z.object({
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

export const OpenAiCompatibleStreamErrorSchema = z.object({
  error: z.union([z.string(), z.object({ message: z.string().optional() })]),
});

export const OpenAiCompatibleChatCompletionResponseSchema = z.object({
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

export type OpenAiCompatibleChatCompletionResponse = z.infer<typeof OpenAiCompatibleChatCompletionResponseSchema>;
