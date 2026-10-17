import type { GenerationReadinessResponse } from '@immersion/contracts/generation';
import type { ProviderSettingsSnapshot } from '@immersion/contracts/providers';
import {
  type RuntimeLogsResponse,
  type RuntimeModelSummary,
  type RuntimeOverviewResponse,
  RuntimeStartCommandSchema,
  type RuntimeStatusSnapshot,
} from '@immersion/contracts/runtime';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { ServerControlScreen } from '.';
import { runtimeOverviewQueryKey } from './queries/runtime-overview-query';

const MODELS_DIR = 'D:\\Модели';
const START_FAILURE = 'Process exited with code 1';
const FAILED_LOAD_LOG_LINE = '[stderr] llama_model_load: не удалось выделить буфер CUDA';

type ListedModel = Omit<RuntimeModelSummary, 'isActive'>;

function model(name: string, path: string): ListedModel {
  return { name, path, size: 4_368_438_976, sourceDirectory: MODELS_DIR, visionProjectorPath: null };
}

const NESTED = model('mistral/secondary.gguf', `${MODELS_DIR}\\mistral\\secondary.gguf`);
const NESTED_AS_A_SCRIPT_TYPES_IT = 'D:/Модели/mistral/secondary.gguf';
const SAME_FILE_NAME = model('secondary.gguf', `${MODELS_DIR}\\secondary.gguf`);
const LISTED_MODELS = [NESTED, SAME_FILE_NAME];

function overviewWith(
  serverStatus: Partial<RuntimeStatusSnapshot>,
  activeModel: ListedModel | null = null,
): RuntimeOverviewResponse {
  return {
    engine: { defaultModelsDir: MODELS_DIR, executablePath: 'D:\\bin\\llama-server.exe', found: true },
    models: LISTED_MODELS.map((listed) => ({ ...listed, isActive: listed === activeModel })),
    modelsDirsStatus: [{ exists: true, path: MODELS_DIR }],
    serverConfig: {
      contextSize: 8192,
      flashAttention: true,
      gpuLayers: 99,
      modelsDirs: [MODELS_DIR],
      port: 5001,
      threads: 0,
    },
    serverStatus: { error: null, model: null, modelPath: null, pid: null, port: 5001, status: 'idle', ...serverStatus },
  };
}

const RUNNING_NESTED_STARTED_BY_SCRIPT = overviewWith(
  { model: 'secondary.gguf', modelPath: NESTED_AS_A_SCRIPT_TYPES_IT, pid: 4242, status: 'running' },
  NESTED,
);
const STARTING_NESTED = overviewWith(
  { model: 'secondary.gguf', modelPath: NESTED.path, pid: 4242, status: 'starting' },
  NESTED,
);
const FAILED_NESTED = overviewWith(
  { error: START_FAILURE, model: 'secondary.gguf', modelPath: NESTED.path, status: 'error' },
  NESTED,
);
const IDLE = overviewWith({});

const BUILTIN_PROVIDER: ProviderSettingsSnapshot = {
  activeProvider: 'koboldcpp',
  mode: 'builtin',
  providerConfigs: {},
  providerDefinitions: [],
};

const READINESS: GenerationReadinessResponse = {
  activeProvider: 'koboldcpp',
  issue: null,
  mode: 'builtin',
  runtime: null,
  status: 'ready',
  visionSupport: 'unknown',
};

const LOGS: RuntimeLogsResponse = { lines: [FAILED_LOAD_LOG_LINE], status: 'error' };

interface RuntimeApiRequest {
  body: unknown;
  method: string;
  url: string;
}

interface FakeRuntimeApi {
  overview: RuntimeOverviewResponse;
  requests: RuntimeApiRequest[];
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

function startingOverview(body: unknown): RuntimeOverviewResponse {
  const { modelPath } = RuntimeStartCommandSchema.parse(body);
  const startedModel = LISTED_MODELS.find((listed) => listed.path === modelPath) ?? null;

  return overviewWith(
    { model: modelPath.split(/[\\/]/).at(-1) ?? null, modelPath, pid: 4242, status: 'starting' },
    startedModel,
  );
}

function arrangeRuntimeApi(initialOverview: RuntimeOverviewResponse): FakeRuntimeApi {
  const api: FakeRuntimeApi = { overview: initialOverview, requests: [] };

  stubFetch().mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    api.requests.push({ body, method, url });

    switch (`${method} ${url}`) {
      case 'GET /api/providers/settings':
        return json(BUILTIN_PROVIDER);
      case 'GET /api/generation/readiness':
        return json(READINESS);
      case 'GET /api/runtime/overview':
        return json(api.overview);
      case 'GET /api/runtime/logs':
        return json(LOGS);
      case 'POST /api/runtime/start':
        api.overview = startingOverview(body);
        return json(api.overview);
      case 'POST /api/runtime/stop':
        api.overview = IDLE;
        return json(api.overview);
      default:
        throw new Error(`The runtime API fake has no answer for ${method} ${url}.`);
    }
  });

  return api;
}

function modelRow(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^${name.replaceAll('.', '\\.')}`) });
}

async function renderServerPage(overview: RuntimeOverviewResponse) {
  const api = arrangeRuntimeApi(overview);
  const rendered = await renderWithProviders(<ServerControlScreen />);
  await screen.findByRole('heading', { name: 'Модели' });

  return { api, ...rendered };
}

describe('ServerControlScreen', () => {
  it('marks only the model the API reports active, though a script started it by another spelling of its path', async () => {
    await renderServerPage(RUNNING_NESTED_STARTED_BY_SCRIPT);

    const nested = within(modelRow('mistral/secondary.gguf'));
    expect(nested.getByText('активна')).toBeDefined();
    expect(nested.queryByRole('button', { name: /Запустить/ })).toBeNull();

    const sameFileName = within(modelRow('secondary.gguf'));
    expect(sameFileName.queryByText('активна')).toBeNull();
    expect(sameFileName.getByRole('button', { name: /Запустить/ })).toBeDefined();
  });

  it('shows why the active model failed to start', async () => {
    await renderServerPage(FAILED_NESTED);

    expect(screen.getByText(START_FAILURE)).toBeDefined();
    expect(within(modelRow('mistral/secondary.gguf')).getByText('ошибка')).toBeDefined();
  });

  it('starts a model that failed to start again from its row', async () => {
    const { api } = await renderServerPage(FAILED_NESTED);

    fireEvent.click(within(modelRow('mistral/secondary.gguf')).getByRole('button', { name: /Запустить/ }));

    await waitFor(() =>
      expect(api.requests).toContainEqual({
        body: expect.objectContaining({ modelPath: NESTED.path }),
        method: 'POST',
        url: '/api/runtime/start',
      }),
    );
    expect(await within(modelRow('mistral/secondary.gguf')).findByText('запускается')).toBeDefined();
  });

  it('stops the runtime from the error state', async () => {
    const { api } = await renderServerPage(FAILED_NESTED);

    fireEvent.click(screen.getByRole('button', { name: /Остановить/ }));

    await waitFor(() => expect(api.requests).toContainEqual({ body: {}, method: 'POST', url: '/api/runtime/stop' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Остановить/ })).toBeNull());
  });

  it('offers no stop while the model is still starting', async () => {
    await renderServerPage(STARTING_NESTED);

    expect(screen.queryByRole('button', { name: /Остановить/ })).toBeNull();
  });

  it('expands the server logs on its own when a start fails', async () => {
    const { api, queryClient } = await renderServerPage(STARTING_NESTED);
    expect(screen.queryByText(FAILED_LOAD_LOG_LINE)).toBeNull();

    api.overview = FAILED_NESTED;
    await queryClient.refetchQueries({ queryKey: runtimeOverviewQueryKey });

    expect(await screen.findByText(FAILED_LOAD_LOG_LINE)).toBeDefined();
  });
});
