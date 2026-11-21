import { fetchRefusingRedirects } from '../../../../../platform/outbound-http/fetch-refusing-redirects.js';
import type { HttpFetch } from '../../../../../platform/outbound-http/http-fetch.js';
import { resolveAnthropicMessagesUrl } from '../../../../providers/index.js';
import type {
  ChatCompletionClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from '../../../application/chat-completion-client.js';
import { ProviderGenerationError } from '../../../application/generation-errors.js';
import { buildRequestSignal, isAbortError, readProviderErrorText } from '../http.js';
import type { ProviderClientDependencies } from '../provider-client-dependencies.js';
import { readProviderReply } from '../reply-reader.js';
import { AnthropicModelOutputLimits } from './model-output-limit.js';
import { readAnthropicJsonReply, readAnthropicStreamData } from './reply.js';
import { buildAnthropicBody, buildAnthropicHeaders } from './request.js';

export class AnthropicClient implements ChatCompletionClient {
  private readonly httpFetch: HttpFetch;
  private readonly outputLimits: AnthropicModelOutputLimits;

  constructor(dependencies: ProviderClientDependencies) {
    this.httpFetch = dependencies.httpFetch;
    this.outputLimits = new AnthropicModelOutputLimits(dependencies);
  }

  async completeChat(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const maxTokens = request.maxTokens ?? (await this.outputLimits.resolve(request.endpoint, request.signal));
    let response: Response;

    try {
      response = await fetchRefusingRedirects(this.httpFetch, resolveAnthropicMessagesUrl(request.endpoint), {
        method: 'POST',
        headers: buildAnthropicHeaders(request.endpoint.apiKey),
        body: JSON.stringify(buildAnthropicBody(request, maxTokens)),
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
