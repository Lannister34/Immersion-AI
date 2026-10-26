import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';

import type { TokenizeTarget } from '../modules/generation/index.js';
import type { LogPort } from '../platform/logging/log-port.js';

export interface BuiltinTokenizeTargetSources {
  readonly log: LogPort;
  readonly providers: {
    getProviderSettings(): Promise<Pick<ProviderSettingsSnapshot, 'mode'>>;
  };
  readonly runtime: {
    getRunningRuntimeEndpoint(): Promise<TokenizeTarget | null>;
  };
}

export function createBuiltinTokenizeTargetResolver(
  sources: BuiltinTokenizeTargetSources,
): () => Promise<TokenizeTarget | null> {
  return async () => {
    try {
      const settings = await sources.providers.getProviderSettings();

      if (settings.mode !== 'builtin') {
        return null;
      }

      const endpoint = await sources.runtime.getRunningRuntimeEndpoint();

      return endpoint ? { baseUrl: endpoint.baseUrl, model: endpoint.model } : null;
    } catch (error) {
      sources.log.warn({ err: error }, 'Tokenize target unavailable; counting tokens approximately');

      return null;
    }
  };
}
