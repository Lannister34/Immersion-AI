import { z } from 'zod';

const AnthropicContentBlockSchema = z.object({
  text: z.string().optional(),
  thinking: z.string().optional(),
  type: z.string(),
});

export const AnthropicMessageResponseSchema = z.object({
  content: z.array(AnthropicContentBlockSchema),
});

export type AnthropicMessageResponse = z.infer<typeof AnthropicMessageResponseSchema>;

export const AnthropicStreamEventSchema = z.object({
  delta: AnthropicContentBlockSchema.optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  type: z.string(),
});
