import { resolveChatCompletionsUrl } from '../../../../providers/application/generation-provider.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../../../application/chat-completion-client.js';
import { ProviderGenerationError } from '../../../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from '../http.js';
import { readProviderReply } from '../reply-reader.js';
import { readOpenAiJsonReply, readOpenAiStreamData } from './reply.js';
import { buildOpenAiBody, buildOpenAiHeaders } from './request.js';

export class OpenAiClient implements ChatCompletionClient {
  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    let response: Response;

    try {
      response = await fetch(resolveChatCompletionsUrl(request.endpoint), {
        method: 'POST',
        headers: buildOpenAiHeaders(request.endpoint.apiKey),
        body: JSON.stringify(buildOpenAiBody(request)),
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
