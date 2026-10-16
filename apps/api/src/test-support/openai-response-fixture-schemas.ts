import { z } from 'zod';

const FinishReasonFixtureSchema = z.enum(['length', 'stop']);

export const OpenAiChatCompletionFixtureSchema = z.looseObject({
  id: z.string().startsWith('chatcmpl-'),
  object: z.literal('chat.completion'),
  created: z.number().int(),
  model: z.string(),
  choices: z.tuple([
    z.looseObject({
      index: z.literal(0),
      finish_reason: FinishReasonFixtureSchema,
      message: z.looseObject({
        role: z.literal('assistant'),
        content: z.string(),
        reasoning_content: z.string().optional(),
      }),
    }),
  ]),
  usage: z.looseObject({
    prompt_tokens: z.number().int(),
    completion_tokens: z.number().int(),
    total_tokens: z.number().int(),
  }),
});

export const OpenAiChatCompletionChunkFixtureSchema = z.looseObject({
  id: z.string().startsWith('chatcmpl-'),
  object: z.literal('chat.completion.chunk'),
  created: z.number().int(),
  model: z.string(),
  choices: z.tuple([
    z.looseObject({
      index: z.literal(0),
      finish_reason: FinishReasonFixtureSchema.nullable(),
      delta: z.looseObject({
        role: z.literal('assistant').optional(),
        content: z.string().optional(),
        reasoning_content: z.string().optional(),
      }),
    }),
  ]),
});

export const OpenAiErrorFixtureSchema = z.looseObject({
  error: z.looseObject({
    code: z.string(),
    message: z.string(),
    type: z.string(),
  }),
});

export const OpenAiModelListFixtureSchema = z.looseObject({
  object: z.literal('list'),
  data: z.array(
    z.looseObject({
      id: z.string(),
      object: z.literal('model'),
      created: z.number().int(),
      owned_by: z.string(),
    }),
  ),
});
