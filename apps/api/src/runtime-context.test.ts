import fs from 'node:fs/promises';
import path from 'node:path';

import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import {
  ChatReplyPromptPreviewResponseSchema,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';
import { type RuntimeLaunchConfig, RuntimeOverviewResponseSchema } from '@immersion/contracts/runtime';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDeferred } from './test-support/deferred.js';
import { waitForGenerationJob } from './test-support/generation-jobs.js';
import { openAiChatCompletion } from './test-support/provider-responses.js';
import { storedSamplerPreset } from './test-support/stored-sampler-preset.js';
import { useTestApi } from './test-support/use-test-api.js';

const PORT = 6006;
const COMPLETIONS_URL = `http://127.0.0.1:${PORT}/v1/chat/completions`;
const MODEL_FILE = 'Артемида-12B.Q4_K_M.gguf';
const LAUNCH: RuntimeLaunchConfig = { contextSize: 32_256, flashAttention: true, gpuLayers: 40, threads: 6 };

describe('the preset context drives the built-in runtime', () => {
  const api = useTestApi({ fixture: 'smoke' });

  function modelsDirectory() {
    return path.join(api().dataRoot, 'Модели');
  }

  function modelPath() {
    return path.join(modelsDirectory(), MODEL_FILE);
  }

  beforeEach(async () => {
    await fs.mkdir(modelsDirectory(), { recursive: true });
    await fs.writeFile(modelPath(), 'gguf');
    await api().settings.patch({
      activePresetId: 'aktivnyy',
      backendMode: 'builtin',
      llmServerConfig: { contextSize: 4096, modelsDirs: [modelsDirectory()] },
      modelPresetMap: {},
      samplerPresets: [
        storedSamplerPreset('aktivnyy', 'Активный', { max_context_length: 16_384, max_length: 'unlimited' }),
        storedSamplerPreset('artemis', 'Artemis', { max_context_length: 48_000, max_length: 'unlimited' }),
      ],
    });
  });

  function runModel(launchConfig: RuntimeLaunchConfig | null = LAUNCH) {
    api().fakeRuntime().runAs({ launchConfig, modelPath: modelPath(), port: PORT });
  }

  async function applyContext(contextSize: number) {
    return api().app.inject({ method: 'POST', url: '/api/runtime/apply-context', payload: { contextSize } });
  }

  async function createChat() {
    const response = await api().app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Контекст' } });

    return CreateChatResponseSchema.parse(response.json()).chat;
  }

  async function preview(chatId: string) {
    const response = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-preview',
      payload: { chatId, draftUserMessage: 'Привет.' },
    });

    return ChatReplyPromptPreviewResponseSchema.parse(response.json());
  }

  describe('starting a model', () => {
    it('launches with the context of the preset bound to the model, ignoring the legacy stored server context', async () => {
      await api().settings.patch({ modelPresetMap: { [MODEL_FILE]: 'artemis' } });

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/runtime/start',
        payload: { flashAttention: false, gpuLayers: 0, modelPath: modelPath(), port: PORT, threads: 0 },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([48_000]);
    });

    it('launches with the active preset context when no preset is bound to the model', async () => {
      await api().app.inject({
        method: 'POST',
        url: '/api/runtime/start',
        payload: { flashAttention: false, gpuLayers: 0, modelPath: modelPath(), port: PORT, threads: 0 },
      });

      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([16_384]);
    });

    it('launches with 8192 when the preset sets no context', async () => {
      await api().settings.patch({
        samplerPresets: [storedSamplerPreset('aktivnyy', 'Активный', { max_context_length: 0 })],
      });

      await api().app.inject({
        method: 'POST',
        url: '/api/runtime/start',
        payload: { flashAttention: false, gpuLayers: 0, modelPath: modelPath(), port: PORT, threads: 0 },
      });

      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([8192]);
    });

    it('still honours a contextSize the caller sends, as the ComfyUI llm_load node does', async () => {
      await api().app.inject({
        method: 'POST',
        url: '/api/runtime/start',
        payload: {
          contextSize: 32_768,
          flashAttention: false,
          gpuLayers: 0,
          modelPath: modelPath(),
          port: PORT,
          threads: 0,
        },
      });

      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([32_768]);
    });
  });

  describe('a context that waits to be applied', () => {
    it('budgets against the context the server runs and reports the preset context as pending', async () => {
      await api().settings.patch({ activePresetId: 'artemis' });
      runModel();
      const chat = await createChat();

      const { diagnostics } = await preview(chat.id);

      expect(diagnostics.contextWindow).toEqual({ pendingSize: 48_000, size: 32_256, source: 'runtime' });
      expect(diagnostics.tokenEstimate.promptBudget).toBe(32_256 - 4032);
    });

    it('reports nothing pending for a cloud provider, whose window is the preset context', async () => {
      await api().settings.useExternalProvider({ url: 'http://127.0.0.1:6123' });
      await api().settings.patch({ activePresetId: 'artemis' });
      const chat = await createChat();

      const { diagnostics } = await preview(chat.id);

      expect(diagnostics.contextWindow).toEqual({ pendingSize: null, size: 48_000, source: 'preset' });
      expect(diagnostics.tokenEstimate).toMatchObject({ promptBudget: 42_000, replyReservation: 6000 });
    });

    it('generates with the running window while the new context waits, without restarting the server', async () => {
      await api().settings.patch({ activePresetId: 'artemis' });
      runModel();
      api().http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('Ответ.'));
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });
      await waitForGenerationJob(
        api(),
        StartChatReplyGenerationJobResponseSchema.parse(response.json()).job.id,
        'completed',
      );

      expect(api().fakeRuntime().starts).toEqual([]);
      expect(api().fakeRuntime().getState().launchConfig?.contextSize).toBe(32_256);
    });
  });

  describe('applying the context', () => {
    it('restarts the running model with the new context and its other launch settings', async () => {
      runModel();

      const response = await applyContext(48_000);
      const overview = RuntimeOverviewResponseSchema.parse(response.json());

      expect(response.statusCode, response.body).toBe(200);
      expect(api().fakeRuntime().starts).toEqual([
        { ...LAUNCH, contextSize: 48_000, modelPath: modelPath(), port: PORT },
      ]);
      expect(overview.serverStatus).toMatchObject({
        launchConfig: { ...LAUNCH, contextSize: 48_000 },
        status: 'running',
      });
    });

    it('does nothing when the server already runs that context', async () => {
      runModel();

      const response = await applyContext(32_256);

      expect(response.statusCode).toBe(200);
      expect(api().fakeRuntime().starts).toEqual([]);
    });

    it('refuses with runtime_launch_unknown, not "not running", when the running server has no recorded launch parameters', async () => {
      runModel(null);

      const response = await applyContext(48_000);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'runtime_launch_unknown' });
    });

    it('refuses with runtime_not_running when no model runs', async () => {
      const response = await applyContext(48_000);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'runtime_not_running' });
    });

    it('refuses with generation_in_progress while a reply is being generated, and leaves the server alone', async () => {
      runModel();
      const providerHeld = createDeferred<Response>();
      api().http.on('POST', COMPLETIONS_URL, () => providerHeld.promise);
      const chat = await createChat();
      const started = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });
      const jobId = StartChatReplyGenerationJobResponseSchema.parse(started.json()).job.id;

      const response = await applyContext(48_000);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_in_progress' });
      expect(api().fakeRuntime().starts).toEqual([]);

      providerHeld.resolve(openAiChatCompletion('Ответ.'));
      await waitForGenerationJob(api(), jobId, 'completed');
    });

    it('rolls back to the previous context when the model fails to start with the new one, and says so', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart({ exitCode: 1 });

      const response = await applyContext(96_000);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ code: 'runtime_context_apply_failed' });
      expect(response.json<{ message: string }>().message).toContain('96000');
      expect(response.json<{ message: string }>().message).toContain('прежним контекстом 32256');
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([96_000, 32_256]);
      expect(api().fakeRuntime().getState()).toMatchObject({ launchConfig: LAUNCH, status: 'running' });
    });

    it('fails a generation that starts while the model restarts as an unavailable provider, then generates once it runs', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart('starting');
      api().http.on('POST', COMPLETIONS_URL, () => openAiChatCompletion('Ответ.'));
      const chat = await createChat();

      const applying = applyContext(48_000);
      await expect.poll(() => api().fakeRuntime().getState().status).toBe('starting');
      const duringRestart = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });
      const failed = await waitForGenerationJob(
        api(),
        StartChatReplyGenerationJobResponseSchema.parse(duringRestart.json()).job.id,
        'failed',
      );
      api().fakeRuntime().finishStarting();
      const applied = await applying;

      expect(failed.error).toMatchObject({ code: 'generation_provider_unavailable' });
      expect(applied.statusCode, applied.body).toBe(200);
      expect(api().fakeRuntime().getState().launchConfig?.contextSize).toBe(48_000);
    });

    it('leaves a restart that has not settled alone when the API closes, instead of rolling it back', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart('starting');

      const applying = applyContext(48_000);
      await expect.poll(() => api().fakeRuntime().getState().status).toBe('starting');
      api().fakeRuntime().dispose();
      const response = await applying;

      expect(response.statusCode, response.body).toBe(200);
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([48_000]);
      expect(api().fakeRuntime().getState().status).toBe('starting');
    });

    it('refuses with generation_in_progress while any completion is in flight, such as a /v1 request from ComfyUI', async () => {
      runModel();
      const providerHeld = createDeferred<Response>();
      api().http.on('POST', COMPLETIONS_URL, () => providerHeld.promise);

      const completion = api().app.inject({
        method: 'POST',
        url: '/v1/chat/completions',
        payload: { messages: [{ content: 'Привет.', role: 'user' }] },
      });
      await expect.poll(() => api().http.requestLines().includes(`POST ${COMPLETIONS_URL}`)).toBe(true);
      const response = await applyContext(48_000);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'generation_in_progress' });
      expect(api().fakeRuntime().starts).toEqual([]);

      providerHeld.resolve(openAiChatCompletion('Ответ.'));
      expect((await completion).statusCode).toBe(200);
    });

    it('points a refused message at «Применить» when the larger chat context is still pending', async () => {
      await api().settings.patch({
        activePresetId: 'tight',
        samplerPresets: [storedSamplerPreset('tight', 'Тесный', { max_context_length: 48_000, max_length: 32_256 })],
      });
      runModel();
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'prompt_exceeds_context' });
      expect(response.json<{ message: string }>().message).toContain(
        'Контекст 48000 из настроек чата ещё не применён: нажмите «Применить»',
      );
    });

    it('applies two concurrent requests one after the other, so only one restart happens and no second server is spawned', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart('starting');

      const first = applyContext(48_000);
      const second = applyContext(48_000);
      await expect.poll(() => api().fakeRuntime().getState().status).toBe('starting');
      api().fakeRuntime().finishStarting();
      const responses = await Promise.all([first, second]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([48_000]);
    });

    it('lets a stop sent during the restart wait its turn, and never rolls the stopped model back', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart('starting');

      const applying = applyContext(48_000);
      await expect.poll(() => api().fakeRuntime().getState().status).toBe('starting');
      const stopping = api().app.inject({ method: 'POST', url: '/api/runtime/stop', payload: {} });
      api().fakeRuntime().finishStarting();
      const [applied, stopped] = await Promise.all([applying, stopping]);

      expect(applied.statusCode, applied.body).toBe(200);
      expect(stopped.statusCode).toBe(200);
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([48_000]);
      expect(api().fakeRuntime().getState().status).toBe('idle');
    });

    it('rolls nothing back when the server ends in another state than its own failed launch', async () => {
      runModel();
      api().fakeRuntime().scriptNextStart('starting');

      const applying = applyContext(48_000);
      await expect.poll(() => api().fakeRuntime().getState().status).toBe('starting');
      await api().fakeRuntime().stop();
      const response = await applying;

      expect(response.statusCode, response.body).toBe(200);
      expect(
        api()
          .fakeRuntime()
          .starts.map((start) => start.contextSize),
      ).toEqual([48_000]);
    });

    it('accepts any context the preview can report as pending, since both sides read it with one schema', async () => {
      runModel();

      const response = await applyContext(20_000_000);

      expect(response.statusCode, response.body).toBe(200);
      expect(api().fakeRuntime().getState().launchConfig?.contextSize).toBe(20_000_000);
    });

    it('does not point a refusal at «Применить» when the pending context is smaller and would only make it worse', async () => {
      await api().settings.patch({
        activePresetId: 'tight',
        samplerPresets: [storedSamplerPreset('tight', 'Тесный', { max_context_length: 4096, max_length: 32_256 })],
      });
      runModel();
      const chat = await createChat();

      const response = await api().app.inject({
        method: 'POST',
        url: '/api/generation/chat-reply-jobs',
        payload: { chatId: chat.id, message: 'Привет.' },
      });

      expect(response.json()).toMatchObject({ code: 'prompt_exceeds_context' });
      expect(response.json<{ message: string }>().message).not.toContain('Применить');
    });

    it('refuses a context outside the contract with 400', async () => {
      runModel();

      const response = await applyContext(0);

      expect(response.statusCode).toBe(400);
    });
  });
});
