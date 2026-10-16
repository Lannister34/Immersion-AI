const OPENAI_REASONING_MODEL_PATTERNS = [/^o\d/u, /^gpt-5/u];

export function isOpenAiReasoningModel(model: string): boolean {
  return OPENAI_REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(model));
}
