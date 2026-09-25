import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  type RuntimeConfigCommand,
  RuntimeLogsResponseSchema,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';
import { selectRuntimeInstallPlan } from './modules/runtime/application/install-runtime.js';

describe('runtime control routes', () => {
  let dataRoot = '';

  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'immersion-runtime-'));
    process.env.IMMERSION_DATA_ROOT = dataRoot;
  });

  afterEach(async () => {
    delete process.env.IMMERSION_DATA_ROOT;
    await fs.rm(dataRoot, { force: true, recursive: true });
  });

  // Менеджер процесса — синглтон без публичного API для засева буфера логов,
  // поэтому честно проверяем только пустой путь и форму контракта.
  it('returns empty runtime logs while no server output was captured', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/runtime/logs',
    });
    const logs = RuntimeLogsResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(logs.lines).toEqual([]);
    expect(logs.status).toBe('idle');

    await app.close();
  });

  it('falls back to the log file when the in-memory buffer is empty', async () => {
    // Модель могла быть запущена предыдущим процессом API — тогда живого stdout
    // уже нет, и единственный источник вывода это файл.
    await fs.mkdir(path.join(dataRoot, 'logs'), { recursive: true });
    await fs.writeFile(
      path.join(dataRoot, 'logs', 'llm-server.log'),
      'llama_model_loader: loaded meta data\n[stderr] warming up the model\n',
      'utf8',
    );

    const app = buildApiApp();
    const response = await app.inject({
      method: 'GET',
      url: '/api/runtime/logs',
    });
    const logs = RuntimeLogsResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(logs.lines).toEqual(['llama_model_loader: loaded meta data', '[stderr] warming up the model']);

    await app.close();
  });

  it('updates runtime config without overwriting unrelated user settings', async () => {
    await fs.writeFile(
      path.join(dataRoot, 'user-settings.json'),
      JSON.stringify(
        {
          userName: 'Misha',
          llmServerConfig: {
            modelsDirs: ['old-models'],
            port: 5001,
            gpuLayers: 0,
            contextSize: 8192,
            flashAttention: false,
            threads: 0,
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    const command: RuntimeConfigCommand = {
      modelsDirs: ['models'],
      port: 5010,
      gpuLayers: 42,
      contextSize: 16384,
      flashAttention: true,
      threads: 8,
    };

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: command,
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());
    const stored = JSON.parse(await fs.readFile(path.join(dataRoot, 'user-settings.json'), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(response.statusCode).toBe(200);
    expect(overview.serverConfig).toMatchObject({
      port: 5010,
      gpuLayers: 42,
      contextSize: 16384,
      flashAttention: true,
      threads: 8,
    });
    expect(stored.userName).toBe('Misha');
    expect(stored.llmServerConfig).toMatchObject(command);

    await app.close();
  });

  it('scans models from updated modelsDirs and marks missing directories without failing the overview', async () => {
    const modelsDir = path.join(dataRoot, 'gguf-models');
    const missingDir = path.join(dataRoot, 'no-such-dir');
    await fs.mkdir(modelsDir, { recursive: true });
    await fs.writeFile(path.join(modelsDir, 'dummy.gguf'), 'stub');

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: {
        // Дубликат в команде проверяет серверную дедупликацию.
        modelsDirs: [modelsDir, missingDir, modelsDir],
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.serverConfig.modelsDirs).toEqual([modelsDir, missingDir]);
    expect(overview.models.map((model) => model.name)).toEqual(['dummy.gguf']);
    expect(overview.modelsDirsStatus).toEqual([
      { path: modelsDir, exists: true },
      { path: missingDir, exists: false },
    ]);

    await app.close();
  });

  it('reports each scanned model with its own mmproj projector and hides projectors from the list', async () => {
    const modelsDir = path.join(dataRoot, 'models-root');
    const visionDir = path.join(modelsDir, 'vl');
    const textDir = path.join(modelsDir, 'text');
    await fs.mkdir(visionDir, { recursive: true });
    await fs.mkdir(textDir, { recursive: true });
    const projectorPath = path.join(visionDir, 'mmproj-F16.gguf');
    const flatProjectorPath = path.join(modelsDir, 'mmproj-Gemma-3-4B-f16.gguf');
    await fs.writeFile(path.join(visionDir, 'Qwen-VL-Q4_K_M.gguf'), 'gguf');
    await fs.writeFile(path.join(visionDir, 'Qwen-VL-Q8_0.gguf'), 'gguf');
    await fs.writeFile(projectorPath, 'gguf');
    await fs.writeFile(path.join(textDir, 'Qwen-VL-Q2_K.gguf'), 'gguf');
    await fs.writeFile(path.join(modelsDir, 'Gemma-3-4B-Q4_K_M.gguf'), 'gguf');
    await fs.writeFile(path.join(modelsDir, 'Llama-3-8B-Q4_K_M.gguf'), 'gguf');
    await fs.writeFile(flatProjectorPath, 'gguf');

    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: {
        modelsDirs: [modelsDir],
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(Object.fromEntries(overview.models.map((model) => [model.name, model.visionProjectorPath]))).toEqual({
      'Gemma-3-4B-Q4_K_M.gguf': flatProjectorPath,
      'Llama-3-8B-Q4_K_M.gguf': null,
      'text/Qwen-VL-Q2_K.gguf': null,
      'vl/Qwen-VL-Q4_K_M.gguf': projectorPath,
      'vl/Qwen-VL-Q8_0.gguf': projectorPath,
    });

    await app.close();
  });

  it('rejects blank models directory entries in the config command', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: {
        modelsDirs: ['   '],
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });

    await app.close();
  });

  it('accepts an empty models directory list without falling back to defaults', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: {
        modelsDirs: [],
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.serverConfig.modelsDirs).toEqual([]);
    expect(overview.models).toEqual([]);
    expect(overview.modelsDirsStatus).toEqual([]);

    await app.close();
  });

  it('rejects model start when the requested model path does not exist', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/start',
      payload: {
        modelPath: path.join(dataRoot, 'missing.gguf'),
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'validation_error',
    });

    await app.close();
  });

  it('rejects model start when the multimodal projector path does not exist', async () => {
    const modelPath = path.join(dataRoot, 'model.gguf');
    await fs.writeFile(modelPath, 'gguf', 'utf8');
    const app = buildApiApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/start',
      payload: {
        contextSize: 8192,
        flashAttention: false,
        gpuLayers: 0,
        mmprojPath: path.join(dataRoot, 'missing-mmproj.gguf'),
        modelPath,
        port: 5001,
        threads: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain('Multimodal projector not found');

    await app.close();
  });

  it('returns runtime overview after stop on an idle server', async () => {
    const app = buildApiApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      payload: {},
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.serverStatus.status).toBe('idle');

    await app.close();
  });
});

describe('runtime installer planning', () => {
  it('selects CPU release asset by latest release tag', () => {
    const plan = selectRuntimeInstallPlan(
      {
        tag_name: 'b8766',
        assets: [
          {
            name: 'llama-b8766-bin-win-cpu-x64.zip',
            browser_download_url: 'https://example.test/cpu.zip',
            size: 1,
          },
        ],
      },
      'cpu',
    );

    expect(plan.assets.map((asset) => asset.name)).toEqual(['llama-b8766-bin-win-cpu-x64.zip']);
  });

  it('selects CUDA runtime and cudart assets together', () => {
    const plan = selectRuntimeInstallPlan(
      {
        tag_name: 'b8766',
        assets: [
          {
            name: 'llama-b8766-bin-win-cuda-12.4-x64.zip',
            browser_download_url: 'https://example.test/cuda.zip',
            size: 1,
          },
          {
            name: 'cudart-llama-bin-win-cuda-12.4-x64.zip',
            browser_download_url: 'https://example.test/cudart.zip',
            size: 1,
          },
        ],
      },
      'cuda-12.4',
    );

    expect(plan.assets.map((asset) => asset.name)).toEqual([
      'llama-b8766-bin-win-cuda-12.4-x64.zip',
      'cudart-llama-bin-win-cuda-12.4-x64.zip',
    ]);
  });
});
