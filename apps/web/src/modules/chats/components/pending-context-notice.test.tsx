import type { RuntimeOverviewResponse } from '@immersion/contracts/runtime';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../../test-support/render-with-providers';
import { stubFetch } from '../../../test-support/stub-fetch';
import { PendingContextNotice, type PendingContextNoticeProps } from './pending-context-notice';

const OVERVIEW: RuntimeOverviewResponse = {
  engine: { found: true, executablePath: 'bin/llama-server', defaultModelsDir: 'models' },
  serverStatus: {
    status: 'running',
    model: 'Артемида.gguf',
    modelPath: 'models/Артемида.gguf',
    error: null,
    port: 5001,
    pid: 4242,
    launchConfig: { contextSize: 48_000, flashAttention: true, gpuLayers: 40, threads: 0 },
  },
  serverConfig: {
    contextSize: 8192,
    flashAttention: true,
    gpuLayers: 40,
    modelsDirs: ['models'],
    port: 5001,
    threads: 0,
  },
  models: [],
  modelsDirsStatus: [],
};

const READY: PendingContextNoticeProps = {
  isDraftSaved: true,
  isGenerating: false,
  isPreviewFetching: false,
  pendingContextSize: 48_000,
  runningContextSize: 32_256,
};

interface RecordedRequest {
  body: unknown;
  method: string;
  url: string;
}

function recordPosts(respond: () => Response): RecordedRequest[] {
  const requests: RecordedRequest[] = [];

  stubFetch().mockImplementation((input, init) => {
    const method = init?.method ?? 'GET';

    if (method === 'GET') return new Promise(() => {});

    requests.push({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      method,
      url: String(input),
    });

    return Promise.resolve(respond());
  });

  return requests;
}

function applyButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: /Применить|Перезапускаем/ }) as HTMLButtonElement;
}

describe('PendingContextNotice', () => {
  it('says the new context is not applied and applies the saved value with «Применить»', async () => {
    const requests = recordPosts(() => Response.json(OVERVIEW));
    await renderWithProviders(<PendingContextNotice {...READY} />);

    expect(screen.getByRole('status').textContent).toContain('не применён');

    fireEvent.click(applyButton());

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      body: { contextSize: 48_000 },
      method: 'POST',
      url: expect.stringMatching(/\/api\/runtime\/apply-context$/u),
    });
  });

  it('offers no apply while a reply is generated, since the restart would cut it', async () => {
    recordPosts(() => Response.json(OVERVIEW));
    await renderWithProviders(<PendingContextNotice {...READY} isGenerating />);

    expect(applyButton().disabled).toBe(true);
    expect(screen.getByText(/Дождитесь окончания генерации/u)).toBeDefined();
  });

  it('offers no apply until the edited context is saved, so it never applies a stale value', async () => {
    recordPosts(() => Response.json(OVERVIEW));
    await renderWithProviders(<PendingContextNotice {...READY} isDraftSaved={false} />);

    expect(applyButton().disabled).toBe(true);
    expect(screen.getByText(/ещё не сохранены/u)).toBeDefined();
  });

  it('offers no apply while the preview is refetched', async () => {
    recordPosts(() => Response.json(OVERVIEW));
    await renderWithProviders(<PendingContextNotice {...READY} isPreviewFetching />);

    expect(applyButton().disabled).toBe(true);
  });

  it('shows why the restart failed, as the API words it', async () => {
    const message =
      'Модель не запустилась с контекстом 48000: llama-server завершился с кодом 1. Она снова работает с прежним контекстом 32256.';
    recordPosts(() => Response.json({ code: 'runtime_context_apply_failed', message }, { status: 502 }));
    await renderWithProviders(<PendingContextNotice {...READY} />);

    fireEvent.click(applyButton());

    expect(await screen.findByText(message)).toBeDefined();
  });
});
