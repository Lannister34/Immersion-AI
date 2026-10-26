import fs from 'node:fs/promises';
import path from 'node:path';

import {
  type RuntimeConfigCommand,
  RuntimeLogsResponseSchema,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';
import { describe, expect, it } from 'vitest';

import { llamaCppAsset, llamaCppBuildRelease, llamaCppNightlyTagRelease } from './test-support/llama-cpp-releases.js';
import { useTestApi } from './test-support/use-test-api.js';

const LLAMA_CPP_RELEASES_URL = 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=30';
const B11912_DOWNLOADS = 'https://github.com/ggml-org/llama.cpp/releases/download/b11912';

describe('runtime control routes', () => {
  const api = useTestApi();

  it('returns empty runtime logs while no server output was captured', async () => {
    const { app } = api();
    const response = await app.inject({
      method: 'GET',
      url: '/api/runtime/logs',
    });
    const logs = RuntimeLogsResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(logs.lines).toEqual([]);
    expect(logs.status).toBe('idle');
  });

  it('falls back to the log file when the in-memory buffer is empty, as after an API restart that left the model running', async () => {
    const { app, dataRoot } = api();
    await fs.mkdir(path.join(dataRoot, 'logs'), { recursive: true });
    await fs.writeFile(
      path.join(dataRoot, 'logs', 'llm-server.log'),
      'llama_model_loader: loaded meta data\n[stderr] warming up the model\n',
      'utf8',
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/runtime/logs',
    });
    const logs = RuntimeLogsResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(logs.lines).toEqual(['llama_model_loader: loaded meta data', '[stderr] warming up the model']);
  });

  it('updates runtime config without overwriting unrelated user settings', async () => {
    const { app, settings } = api();
    await settings.write({
      userName: 'Misha',
      llmServerConfig: {
        modelsDirs: ['old-models'],
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });
    const command: RuntimeConfigCommand = {
      modelsDirs: ['models'],
      port: 5010,
      gpuLayers: 42,
      contextSize: 16384,
      flashAttention: true,
      threads: 8,
    };

    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: command,
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());
    const stored = await settings.read();

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
  });

  it('dedupes updated modelsDirs, scans their models, and marks missing directories without failing the overview', async () => {
    const { app, dataRoot } = api();
    const modelsDir = path.join(dataRoot, 'gguf-models');
    const missingDir = path.join(dataRoot, 'no-such-dir');
    await fs.mkdir(modelsDir, { recursive: true });
    await fs.writeFile(path.join(modelsDir, 'dummy.gguf'), 'stub');

    const response = await app.inject({
      method: 'PUT',
      url: '/api/runtime/config',
      payload: {
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
  });

  it('reports each scanned model with its own mmproj projector and hides projectors from the list', async () => {
    const { app, dataRoot } = api();
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
  });

  it('rejects blank models directory entries in the config command', async () => {
    const { app } = api();
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
  });

  it('accepts an empty models directory list without falling back to defaults', async () => {
    const { app } = api();
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
  });

  it('answers a start with a missing model file with 400 validation_error', async () => {
    const { app, dataRoot } = api();
    const modelPath = path.join(dataRoot, 'Удалённая-модель.gguf');
    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/start',
      payload: {
        modelPath,
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: 'validation_error',
      message: `Model not found: ${modelPath}`,
    });
  });

  it('answers a start body without a model path with 400 validation_error', async () => {
    const { app } = api();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/start',
      payload: {
        port: 5001,
        gpuLayers: 0,
        contextSize: 8192,
        flashAttention: false,
        threads: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
  });

  it('rejects a missing mmproj projector before launch, since llama-server would die after starting and bury the cause in its log', async () => {
    const { app, dataRoot } = api();
    const modelPath = path.join(dataRoot, 'model.gguf');
    await fs.writeFile(modelPath, 'gguf', 'utf8');

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
    expect(response.json()).toEqual({
      code: 'validation_error',
      message: `Multimodal projector not found: ${path.join(dataRoot, 'missing-mmproj.gguf')}`,
    });
  });

  it('returns runtime overview after stop on an idle server', async () => {
    const { app } = api();
    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      payload: {},
    });
    const overview = RuntimeOverviewResponseSchema.parse(response.json());

    expect(response.statusCode).toBe(200);
    expect(overview.serverStatus.status).toBe('idle');
  });
});

describe('runtime install failures', () => {
  const api = useTestApi();

  it('answers a failed release lookup with 502 runtime_install_failed', async () => {
    const { app, http } = api();
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => new Response('upstream down', { status: 500 }));

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'cpu' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Не удалось получить список релизов llama.cpp: HTTP 500.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it('answers an unreachable release server with 502 runtime_install_failed and a message of its own, not the network error', async () => {
    const { app, http } = api();

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'cpu' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Не удалось получить список релизов llama.cpp.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it("answers builds without the variant's asset with 502 runtime_install_failed before anything is downloaded", async () => {
    const { app, http } = api();
    http.on('GET', LLAMA_CPP_RELEASES_URL, () =>
      Response.json([
        llamaCppNightlyTagRelease(),
        llamaCppBuildRelease('b8766', [llamaCppAsset('b8766', 'llama-b8766-bin-win-cpu-x64.zip')]),
      ]),
    );

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'vulkan' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'В последних сборках llama.cpp (до b8766) не найден asset llama-b8766-bin-win-vulkan-x64.zip.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it('answers a release list body GitHub would never send with 502 runtime_install_failed before anything is downloaded', async () => {
    const { app, http } = api();
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => Response.json({ message: 'Moved Permanently' }));

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'cpu' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Ответ GitHub со списком релизов llama.cpp не распознан.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it('refuses a release whose asset would download over plain HTTP before anything is downloaded', async () => {
    const { app, http } = api();
    const plainHttpAsset = {
      ...llamaCppAsset('b8766', 'llama-b8766-bin-win-cpu-x64.zip'),
      browser_download_url: 'http://example.test/cpu.zip',
    };
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => Response.json([llamaCppBuildRelease('b8766', [plainHttpAsset])]));

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'cpu' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Ответ GitHub со списком релизов llama.cpp не распознан.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it('downloads the newest build behind a semver latest release and refuses an archive whose sha256 differs from its digest', async () => {
    const { app, http } = api();
    const assetUrl = `${B11912_DOWNLOADS}/llama-b11912-bin-win-cuda-13.4-x64.zip`;
    http.on('GET', LLAMA_CPP_RELEASES_URL, () =>
      Response.json([llamaCppNightlyTagRelease(), llamaCppBuildRelease('b11912'), llamaCppBuildRelease('b11910')]),
    );
    http.on('GET', assetUrl, () => new Response('not the archive the digest names'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/install',
      payload: { variant: 'cuda-13.4' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Контрольная сумма llama-b11912-bin-win-cuda-13.4-x64.zip не совпадает с указанной в релизе llama.cpp.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`, `GET ${assetUrl}`]);
  });

  it('downloads and checks every asset of the variant before it unpacks any of them', async () => {
    const { app, http } = api();
    const runtimeUrl = `${B11912_DOWNLOADS}/llama-b11912-bin-win-cuda-13.4-x64.zip`;
    const cudartUrl = `${B11912_DOWNLOADS}/cudart-llama-bin-win-cuda-13.4-x64.zip`;
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => Response.json([llamaCppBuildRelease('b11912')]));
    http.on('GET', runtimeUrl, () => new Response('llama-b11912-bin-win-cuda-13.4-x64.zip'));
    http.on('GET', cudartUrl, () => new Response('not the archive the digest names'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/install',
      payload: { variant: 'cuda-13.4' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Контрольная сумма cudart-llama-bin-win-cuda-13.4-x64.zip не совпадает с указанной в релизе llama.cpp.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`, `GET ${runtimeUrl}`, `GET ${cudartUrl}`]);
  });

  it('downloads an asset GitHub gives no digest for without checking it', async () => {
    const { app, http } = api();
    const runtimeUrl = `${B11912_DOWNLOADS}/llama-b11912-bin-win-cuda-13.4-x64.zip`;
    const cudartUrl = `${B11912_DOWNLOADS}/cudart-llama-bin-win-cuda-13.4-x64.zip`;
    const undigestedRuntime = llamaCppAsset('b11912', 'llama-b11912-bin-win-cuda-13.4-x64.zip', null);
    const cudart = llamaCppAsset('b11912', 'cudart-llama-bin-win-cuda-13.4-x64.zip');
    http.on('GET', LLAMA_CPP_RELEASES_URL, () =>
      Response.json([llamaCppBuildRelease('b11912', [undigestedRuntime, cudart])]),
    );
    http.on('GET', runtimeUrl, () => new Response('any bytes at all'));
    http.on('GET', cudartUrl, () => new Response('not the archive the digest names'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/install',
      payload: { variant: 'cuda-13.4' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Контрольная сумма cudart-llama-bin-win-cuda-13.4-x64.zip не совпадает с указанной в релизе llama.cpp.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`, `GET ${runtimeUrl}`, `GET ${cudartUrl}`]);
  });

  it('refuses a variant whose second asset has a digest that is not a sha256 before anything is downloaded', async () => {
    const { app, http } = api();
    const runtime = llamaCppAsset('b11912', 'llama-b11912-bin-win-cuda-13.4-x64.zip');
    const md5Cudart = llamaCppAsset('b11912', 'cudart-llama-bin-win-cuda-13.4-x64.zip', 'md5:0123456789abcdef');
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => Response.json([llamaCppBuildRelease('b11912', [runtime, md5Cudart])]));

    const response = await app.inject({
      method: 'POST',
      url: '/api/runtime/install',
      payload: { variant: 'cuda-13.4' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message:
        'Контрольная сумма cudart-llama-bin-win-cuda-13.4-x64.zip в релизе llama.cpp указана в неизвестном формате.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it('refuses an asset whose digest is not a sha256 before anything is downloaded', async () => {
    const { app, http } = api();
    const md5Asset = llamaCppAsset('b11912', 'llama-b11912-bin-win-cpu-x64.zip', 'md5:0123456789abcdef');
    http.on('GET', LLAMA_CPP_RELEASES_URL, () => Response.json([llamaCppBuildRelease('b11912', [md5Asset])]));

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant: 'cpu' } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      code: 'runtime_install_failed',
      message: 'Контрольная сумма llama-b11912-bin-win-cpu-x64.zip в релизе llama.cpp указана в неизвестном формате.',
    });
    expect(http.requestLines()).toEqual([`GET ${LLAMA_CPP_RELEASES_URL}`]);
  });

  it.each([
    'rocm',
    'cuda-13.1',
  ])('answers the install variant %s with 400 validation_error before the release is looked up', async (variant) => {
    const { app, http } = api();

    const response = await app.inject({ method: 'POST', url: '/api/runtime/install', payload: { variant } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'validation_error' });
    expect(http.requests).toEqual([]);
  });
});
