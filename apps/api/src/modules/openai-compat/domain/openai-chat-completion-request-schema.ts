import { z } from 'zod';

export const OpenAiContentPartSchema = z.object({
  image_url: z.object({ url: z.string().min(1) }).optional(),
  text: z.string().optional(),
  type: z.string(),
});

export const OpenAiRequestMessageSchema = z.object({
  content: z
    .union([z.string(), z.array(OpenAiContentPartSchema)])
    .nullable()
    .optional(),
  role: z.string().min(1),
});
export type OpenAiRequestMessage = z.infer<typeof OpenAiRequestMessageSchema>;

export const OpenAiChatCompletionRequestSchema = z
  .object({
    max_completion_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    messages: z.array(OpenAiRequestMessageSchema).min(1),
    model: z.string().optional(),
    n: z.number().int().positive().optional(),
    presence_penalty: z.number().min(-2).max(2).optional(),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    tool_choice: z.unknown().optional(),
    tools: z.array(z.unknown()).optional(),
    top_p: z.number().min(0).max(1).optional(),
  })
  .passthrough();
export type OpenAiChatCompletionRequest = z.infer<typeof OpenAiChatCompletionRequestSchema>;
