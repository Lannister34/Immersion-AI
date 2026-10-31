import {
  RuntimeConfigSnapshotSchema,
  type RuntimeLaunchConfig,
  type RuntimeOverviewResponse,
  type RuntimeServerStatus,
} from '@immersion/contracts/runtime';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { ServerControlScreen } from '.';

const ACTIVE_MODEL = 'Артемида-31B-Q4_K_M.gguf';

const SAVED_LAUNCH: RuntimeLaunchConfig = { contextSize: 8192, flashAttention: true, gpuLayers: 999, threads: 0 };

function createOverview(
  status: RuntimeServerStatus,
  launchConfig: RuntimeLaunchConfig | null = status === 'running' ? SAVED_LAUNCH : null,
): RuntimeOverviewResponse {
  return {
    engine: { found: true, executablePath: 'bin/llama-server', defaultModelsDir: 'models' },
    serverStatus: {
      status,
      model: ACTIVE_MODEL,
      modelPath: `models/${ACTIVE_MODEL}`,
      error: status === 'error' ? 'llama-server завершился с кодом 1' : null,
      port: 5001,
      pid: status === 'running' ? 4242 : null,
      launchConfig,
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
        isActive: true,
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

interface RecordedRequest {
  body: unknown;
  method: string;
  url: string;
}

async function openLaunchParams(overview: RuntimeOverviewResponse): Promise<RecordedRequest[]> {
  const requests: RecordedRequest[] = [];
  let current = overview;
  stubFetch().mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

    if (url.endsWith('/api/runtime/overview')) return Promise.resolve(Response.json(current));
    if (method === 'GET') return new Promise(() => {});

    requests.push({ body, method, url });
    if (url.endsWith('/api/runtime/config')) {
      current = {
        ...current,
        serverConfig: RuntimeConfigSnapshotSchema.parse({ ...current.serverConfig, ...(body as object) }),
      };
    }

    return Promise.resolve(Response.json(current));
  });

  await renderWithProviders(<ServerControlScreen />);
  fireEvent.click(await screen.findByRole('button', { name: /Параметры/ }));

  return requests;
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

  it('saves only the launch parameters, leaving the directories to their own form, and offers to restart the running model', async () => {
    const requests = await openLaunchParams(createOverview('running'));

    fireEvent.change(screen.getByLabelText('Контекст, токенов'), { target: { value: '32256' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const restart = await screen.findByRole('button', { name: /Перезапустить/ });
    expect(requests).toEqual([
      {
        body: { ...SAVED_LAUNCH, contextSize: 32_256 },
        method: 'PUT',
        url: expect.stringMatching(/\/api\/runtime\/config$/u),
      },
    ]);

    fireEvent.click(restart);

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      body: {
        contextSize: 32_256,
        flashAttention: true,
        gpuLayers: 999,
        modelPath: `models/${ACTIVE_MODEL}`,
        port: 5001,
        threads: 0,
      },
      method: 'POST',
      url: expect.stringMatching(/\/api\/runtime\/start$/u),
    });
  });

  it('shows the context the running model was started with, not the saved one', async () => {
    await openLaunchParams(createOverview('running', { ...SAVED_LAUNCH, contextSize: 4096 }));

    expect(screen.getByText('ctx 4 096')).toBeDefined();
    expect(screen.getByText(/Модель работает с ctx/)).toBeDefined();
  });

  it('refuses to save a context size that is not a positive whole number', async () => {
    const requests = await openLaunchParams(createOverview('idle'));

    fireEvent.change(screen.getByLabelText('Контекст, токенов'), { target: { value: '0' } });

    expect(screen.getByText(/Размер контекста/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(true);
    expect(requests).toEqual([]);
  });
});
