import { describe, expect, it } from 'vitest';

import { createInMemoryUserSettings } from '../../../test-support/in-memory-user-settings.js';
import type { UserSettingsRecord } from '../../settings/index.js';
import { DEFAULT_OPENAI_COMPATIBLE_MODEL } from '../domain/provider-settings.js';
import { GenerationProviderUnavailableError, resolveGenerationProviderEndpoint } from './generation-provider.js';
import { ProviderSettingsRepository } from './provider-settings-repository.js';
import type { RunningRuntimeEndpointInfo, RuntimeEndpointPort } from './runtime-endpoint-port.js';

function runtimeRunning(endpoint: RunningRuntimeEndpointInfo | null): RuntimeEndpointPort {
  return { getRunningEndpoint: () => Promise.resolve(endpoint) };
}

function resolveOn(stored: UserSettingsRecord, runtimeEndpoint: RuntimeEndpointPort = runtimeRunning(null)) {
  return resolveGenerationProviderEndpoint({
    providerSettings: new ProviderSettingsRepository({ document: createInMemoryUserSettings(stored) }),
    runtimeEndpoint,
  });
}

describe('resolveGenerationProviderEndpoint', () => {
  it('resolves the running builtin endpoint', async () => {
    const endpoint = await resolveOn(
      { backendMode: 'builtin' },
      runtimeRunning({
        baseUrl: 'http://127.0.0.1:5001',
        contextSize: 8192,
        model: 'Гемма-27B.gguf',
        visionProjectorPath: null,
      }),
    );

    expect(endpoint).toEqual({
      apiKey: null,
      apiKind: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:5001',
      contextSize: 8192,
      model: 'Гемма-27B.gguf',
    });
  });

  it('reports a builtin mode without a running server as GenerationProviderUnavailableError', async () => {
    await expect(resolveOn({ backendMode: 'builtin' })).rejects.toBeInstanceOf(GenerationProviderUnavailableError);
  });

  it('reports a blank external URL as GenerationProviderUnavailableError', async () => {
    await expect(
      resolveOn({
        activeProvider: 'custom',
        backendMode: 'external',
        providerConfigs: { custom: { model: 'qwen3-8b', url: '   ' } },
      }),
    ).rejects.toBeInstanceOf(GenerationProviderUnavailableError);
  });

  it('uses the provider default model when none is stored', async () => {
    const endpoint = await resolveOn({
      activeProvider: 'custom',
      backendMode: 'external',
      providerConfigs: { custom: { url: 'http://127.0.0.1:6001' } },
    });

    expect(endpoint).toMatchObject({ baseUrl: 'http://127.0.0.1:6001', model: DEFAULT_OPENAI_COMPATIBLE_MODEL });
  });
});
