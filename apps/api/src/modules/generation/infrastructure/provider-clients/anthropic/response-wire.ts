import { z } from 'zod';

const AnthropicContentBlockSchema = z.object({
  text: z.string().optional(),
  thinking: z.string().optional(),
  type: z.string(),
});

export const AnthropicMessageResponseSchema = z.object({
  content: z.array(AnthropicContentBlockSchema),
  stop_reason: z.string().nullable().optional(),
});

export type AnthropicMessageResponse = z.infer<typeof AnthropicMessageResponseSchema>;

export const AnthropicStreamEventSchema = z.object({
  delta: z
    .object({
      stop_reason: z.string().nullable().optional(),
      text: z.string().optional(),
      thinking: z.string().optional(),
      type: z.string().optional(),
    })
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  type: z.string(),
});

export const AnthropicModelInfoSchema = z.object({
  max_tokens: z.number().int().positive().optional(),
});
