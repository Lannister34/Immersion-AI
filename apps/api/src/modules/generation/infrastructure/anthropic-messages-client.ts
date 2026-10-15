import { resolveAnthropicMessagesUrl } from '../../providers/index.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { readAnthropicJsonReply, readAnthropicStreamData } from './anthropic-messages-reply.js';
import { buildAnthropicMessagesBody, buildAnthropicMessagesHeaders } from './anthropic-messages-request.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';
import { readProviderReply } from './provider-reply-reader.js';

export class AnthropicMessagesClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let response: Response;

    try {
      response = await fetch(resolveAnthropicMessagesUrl(request.endpoint), {
        method: 'POST',
        headers: buildAnthropicMessagesHeaders(request.endpoint.apiKey),
        body: JSON.stringify(buildAnthropicMessagesBody(request)),
        signal: buildRequestSignal(request.signal),
      });
    } catch (error) {
      if (request.signal?.aborted || isAbortError(error)) {
        throw error;
      }

      throw new ProviderGenerationError(error instanceof Error ? error.message : 'Provider request failed.');
    }

    if (!response.ok) {
      throw new ProviderGenerationError(
        `Provider returned HTTP ${response.status}${await readProviderErrorText(response)}`,
      );
    }

    return readProviderReply(response, request, {
      readJson: readAnthropicJsonReply,
      readStreamData: readAnthropicStreamData,
    });
  }
}
