import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import { StartChatReplyGenerationJobResponseSchema } from '@immersion/contracts/generation';
import { describe, expect, it, onTestFinished } from 'vitest';

import { createDeferred } from './deferred.js';
import { waitForGenerationJob } from './generation-jobs.js';
import { openAiChatCompletion, providerFailure } from './provider-responses.js';
import { useTestApi } from './use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006/v1/chat/completions';

describe('waitForGenerationJob', () => {
  const api = useTestApi({ fixture: 'smoke' });

  async function startReplyJob(message: string) {
    const { app, settings } = api();
    await settings.useExternalProvider({ url: 'http://127.0.0.1:6006' });
    await settings.patch({ streamingEnabled: false });
    const chat = CreateChatResponseSchema.parse(
      (await app.inject({ method: 'POST', url: '/api/chats', payload: { title: 'Ожидание' } })).json(),
    ).chat;
    const response = await app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message },
    });

    return StartChatReplyGenerationJobResponseSchema.parse(response.json()).job;
  }

  it('follows a held job through running to the status it waits for', async () => {
    const held = api().http.hold('POST', PROVIDER_URL);
    const job = await startReplyJob('Привет.');

    const running = await waitForGenerationJob(api(), job.id, 'running');
    held.release(openAiChatCompletion('Готово.'));
    const completed = await waitForGenerationJob(api(), job.id, 'completed');

    expect(running).toMatchObject({ id: job.id, status: 'running' });
    expect(completed).toMatchObject({ error: null, id: job.id, status: 'completed' });
  });

  it('answers from the snapshot for a job that settled before the wait began', async () => {
    api().http.on('POST', PROVIDER_URL, () => openAiChatCompletion('Готово.'));
    const job = await startReplyJob('Привет.');
    await waitForGenerationJob(api(), job.id, 'completed');

    await expect(waitForGenerationJob(api(), job.id, 'completed')).resolves.toMatchObject({ status: 'completed' });
  });

  it('rejects, naming the status and the error, when the job settles in another status', async () => {
    api().http.on('POST', PROVIDER_URL, () => providerFailure());
    const job = await startReplyJob('Привет.');

    await expect(waitForGenerationJob(api(), job.id, 'completed')).rejects.toThrow(
      `Generation job ${job.id} settled as failed, not completed: {"code":"provider_generation_failed"`,
    );
  });

  it('lets go of the event stream when the test finishes first, so the app still closes', async () => {
    const held = api().http.hold('POST', PROVIDER_URL);
    const job = await startReplyJob('Привет.');
    await held.started;
    const outcome = createDeferred<unknown>();
    onTestFinished(async () => {
      expect(await outcome.promise).toEqual(
        new Error(`The test finished while waiting for generation job ${job.id} to be completed.`),
      );
    });

    const server = await api()
      .listen()
      .then(() => api().app.server);
    const eventsRequested = createDeferred<string | undefined>();
    server.once('request', (request) => eventsRequested.resolve(request.url));

    waitForGenerationJob(api(), job.id, 'completed').then(() => outcome.resolve('resolved'), outcome.resolve);

    expect(await eventsRequested.promise).toBe(`/api/generation/jobs/${job.id}/events`);
  });

  it('rejects for a job the api does not know', async () => {
    const unknownJobId = '00000000-0000-4000-8000-000000000000';

    await expect(waitForGenerationJob(api(), unknownJobId, 'completed')).rejects.toThrow(
      `The event stream of generation job ${unknownJobId} answered HTTP 404.`,
    );
  });
});
