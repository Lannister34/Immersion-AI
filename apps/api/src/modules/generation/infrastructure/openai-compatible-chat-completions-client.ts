import { resolveChatCompletionsUrl } from '../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../application/chat-completion-client.js';
import { ProviderGenerationError } from '../application/generation-errors.js';
import { readOpenAiJsonReply, readOpenAiStreamData } from './openai-compatible-chat-completions-reply.js';
import {
  buildOpenAiCompatibleChatCompletionsBody,
  buildOpenAiCompatibleChatCompletionsHeaders,
} from './openai-compatible-chat-completions-request.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from './provider-http.js';
import { readProviderReply } from './provider-reply-reader.js';

export class OpenAiCompatibleChatCompletionsClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let response: Response;

    try {
      response = await fetch(resolveChatCompletionsUrl(request.endpoint), {
        method: 'POST',
        headers: buildOpenAiCompatibleChatCompletionsHeaders(request.endpoint.apiKey),
        body: JSON.stringify(buildOpenAiCompatibleChatCompletionsBody(request)),
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
      readJson: readOpenAiJsonReply,
      readStreamData: readOpenAiStreamData,
    });
  }
}
