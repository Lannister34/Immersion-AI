import type { RuntimeOverviewResponse, RuntimeServerStatus } from '@immersion/contracts/runtime';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { ServerControlScreen } from '.';

const ACTIVE_MODEL = 'Артемида-31B-Q4_K_M.gguf';

function createOverview(status: RuntimeServerStatus): RuntimeOverviewResponse {
  return {
    engine: { found: true, executablePath: 'bin/llama-server', defaultModelsDir: 'models' },
    serverStatus: {
      status,
      model: ACTIVE_MODEL,
      modelPath: `models/${ACTIVE_MODEL}`,
      error: status === 'error' ? 'llama-server завершился с кодом 1' : null,
      port: 5001,
      pid: status === 'running' ? 4242 : null,
    },
    serverConfig: {
      modelsDirs: ['models'],
      port: 5001,
      gpuLayers: 999,
      contextSize: 8192,
      flashAttention: true,
      threads: 0,
    },
    models: [
      {
        name: ACTIVE_MODEL,
        path: `models/${ACTIVE_MODEL}`,
        size: 1024,
        sourceDirectory: 'models',
        visionProjectorPath: null,
      },
    ],
    modelsDirsStatus: [{ path: 'models', exists: true }],
  };
}

async function renderWithRuntime(status: RuntimeServerStatus): Promise<HTMLElement> {
  const overview = createOverview(status);
  stubFetch().mockImplementation((input) =>
    String(input).endsWith('/api/runtime/overview') ? Promise.resolve(Response.json(overview)) : new Promise(() => {}),
  );

  await renderWithProviders(<ServerControlScreen />);

  return screen.findByRole('row', { name: /Артемида-31B-Q4_K_M\.gguf/ });
}

describe('ServerControlScreen', () => {
  it('offers to start the active model again after it failed to load', async () => {
    const row = await renderWithRuntime('error');

    expect(within(row).getByRole('button', { name: /Запустить/ })).toBeDefined();
  });

  it('does not offer to start the active model while it is running', async () => {
    const row = await renderWithRuntime('running');

    expect(within(row).queryByRole('button', { name: /Запустить/ })).toBeNull();
  });
});
