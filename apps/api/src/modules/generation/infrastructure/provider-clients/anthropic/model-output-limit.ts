import type { LogPort } from '../../../../../platform/logging/log-port.js';
import type { HttpFetch } from '../../../../../platform/outbound-http/http-fetch.js';
import { resolveAnthropicModelUrl } from '../../../../providers/index.js';
import type { ChatCompletionEndpoint } from '../../../application/chat-completion-client.js';
import { buildAnthropicHeaders } from './request.js';
import { AnthropicModelInfoSchema } from './response-wire.js';

export const ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS = 4096;

const MODEL_INFO_TIMEOUT_MS = 10_000;

export const ANTHROPIC_OUTPUT_CAP_FALLBACK_LOG_MESSAGE =
  'Anthropic model output cap is unknown; sending the fallback max_tokens';

export interface AnthropicModelOutputLimitsDependencies {
  readonly httpFetch: HttpFetch;
  readonly logger: LogPort;
}

type OutputCapLookup = { cap: number } | { reason: string; status?: number; err?: unknown };

export class AnthropicModelOutputLimits {
  private readonly knownLimits = new Map<string, number>();

  constructor(private readonly dependencies: AnthropicModelOutputLimitsDependencies) {}

  async resolve(endpoint: ChatCompletionEndpoint, signal: AbortSignal | undefined): Promise<number> {
    const modelUrl = resolveAnthropicModelUrl(endpoint);
    const known = this.knownLimits.get(modelUrl);

    if (known !== undefined) {
      return known;
    }

    const lookup = await this.lookUpCap(modelUrl, endpoint.apiKey, signal);

    if (!('cap' in lookup)) {
      this.dependencies.logger.warn(
        { ...lookup, fallbackMaxTokens: ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS, model: endpoint.model },
        ANTHROPIC_OUTPUT_CAP_FALLBACK_LOG_MESSAGE,
      );

      return ANTHROPIC_FALLBACK_MAX_OUTPUT_TOKENS;
    }

    this.knownLimits.set(modelUrl, lookup.cap);

    return lookup.cap;
  }

  private async lookUpCap(
    modelUrl: string,
    apiKey: string | null,
    signal: AbortSignal | undefined,
  ): Promise<OutputCapLookup> {
    const timeoutSignal = AbortSignal.timeout(MODEL_INFO_TIMEOUT_MS);

    try {
      const response = await this.dependencies.httpFetch(modelUrl, {
        headers: buildAnthropicHeaders(apiKey),
        method: 'GET',
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
      });

      if (!response.ok) {
        await Promise.allSettled([response.body?.cancel()]);
        return { reason: 'the Models API answered with an error or a redirect', status: response.status };
      }

      const parsed = AnthropicModelInfoSchema.safeParse(await response.json());

      if (!parsed.success || parsed.data.max_tokens === undefined) {
        return { reason: 'the model info carries no valid max_tokens' };
      }

      return { cap: parsed.data.max_tokens };
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }

      return { err: error, reason: 'the Models API request failed' };
    }
  }
}
