export const SKIP_THINKING_SERVER_EXTENSIONS = {
  chat_template_kwargs: { enable_thinking: false },
} as const satisfies Record<string, unknown>;
