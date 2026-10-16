import type { OpenAiChatCompletionRequest } from './openai-chat-completion-request-schema.js';
import { UnsupportedOpenAiFeatureError } from './unsupported-openai-feature-error.js';

export function assertSupportedRequest(request: OpenAiChatCompletionRequest): void {
  if (request.n !== undefined && request.n > 1) {
    throw new UnsupportedOpenAiFeatureError('Only one choice per request is supported; drop "n" or set it to 1.');
  }

  if (request.tools?.length || request.tool_choice) {
    throw new UnsupportedOpenAiFeatureError('Tool calls are not supported by this endpoint.');
  }
}
