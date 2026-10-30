import http from 'node:http';

import { CreateChatResponseSchema } from '@immersion/contracts/chats';
import {
  type GenerationJobEvent,
  GenerationJobEventSchema,
  StartChatReplyGenerationJobResponseSchema,
} from '@immersion/contracts/generation';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDeferred } from '../../../../test-support/deferred.js';
import { waitForGenerationJob } from '../../../../test-support/generation-jobs.js';
import { openAiChatStream } from '../../../../test-support/provider-responses.js';
import { createServerSentEventDataDecoder } from '../../../../test-support/server-sent-event-data.js';
import { useTestApi } from '../../../../test-support/use-test-api.js';

const PROVIDER_URL = 'http://127.0.0.1:6006';
const CHAT_COMPLETIONS_URL = `${PROVIDER_URL}/v1/chat/completions`;

interface JobEventStream {
  readonly status: number | undefined;
  readonly contentType: string | undefined;
  readUntil(isLast: (event: GenerationJobEvent) => boolean): Promise<GenerationJobEvent[]>;
  disconnect(): Promise<void>;
}

async function openJobEventStream(url: string): Promise<JobEventStream> {
  const request = http.get(url, { agent: false });
  const closed = new Promise<void>((resolve) => {
    request.once('close', () => resolve());
  });
  const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
    request.once('response', resolve);
    request.once('error', reject);
  });
  response.setEncoding('utf8');
  const chunks: AsyncIterator<string> = response[Symbol.asyncIterator]();
  const decoder = createServerSentEventDataDecoder();
  const received: GenerationJobEvent[] = [];

  return {
    status: response.statusCode,
    contentType: response.headers['content-type'],
    async readUntil(isLast) {
      const events: GenerationJobEvent[] = [];

      for (;;) {
        const event = received.shift();

        if (event !== undefined) {
          events.push(event);

          if (isLast(event)) {
            return events;
          }

          continue;
        }

        const chunk = await chunks.next();

        if (chunk.done === true) {
          throw new Error(`The job event stream ended after ${JSON.stringify(events.map(({ type }) => type))}.`);
        }

        received.push(...decoder.push(chunk.value).map((data) => GenerationJobEventSchema.parse(JSON.parse(data))));
      }
    },
    async disconnect() {
      await chunks.return?.();
      request.destroy();
      await closed;
    },
  };
}

function isTerminalJobUpdate(event: GenerationJobEvent): boolean {
  return event.type === 'generation.job.updated' && event.job.status !== 'running';
}

describe('generation job events route', () => {
  const api = useTestApi({ fixture: 'smoke' });

  beforeEach(async () => {
    await api().settings.useExternalProvider({ url: PROVIDER_URL });
  });

  async function startChatReplyJob(message: string) {
    const chatResponse = await api().app.inject({
      method: 'POST',
      url: '/api/chats',
      payload: { title: 'Job events' },
    });
    const chat = CreateChatResponseSchema.parse(chatResponse.json()).chat;
    const jobResponse = await api().app.inject({
      method: 'POST',
      url: '/api/generation/chat-reply-jobs',
      payload: { chatId: chat.id, message },
    });

    return StartChatReplyGenerationJobResponseSchema.parse(jobResponse.json()).job;
  }

  it('streams the snapshot, then deltas, then the updated session', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const job = await startChatReplyJob('Расскажи что-нибудь.');
    await provider.started;
    const stream = await openJobEventStream(`${await api().listen()}/api/generation/jobs/${job.id}/events`);

    expect(stream.status).toBe(200);
    expect(stream.contentType).toBe('text/event-stream; charset=utf-8');
    expect(await stream.readUntil((event) => event.type === 'generation.job.snapshot')).toMatchObject([
      { job: { id: job.id, status: 'running' }, type: 'generation.job.snapshot' },
    ]);

    provider.release(openAiChatStream([{ content: 'Пер' }, { content: 'вый ' }, { content: 'кусок.' }]));

    expect(await stream.readUntil(isTerminalJobUpdate)).toMatchObject([
      { channel: 'reply', delta: 'Пер', type: 'chat.reply.delta' },
      { channel: 'reply', delta: 'вый ', type: 'chat.reply.delta' },
      { channel: 'reply', delta: 'кусок.', type: 'chat.reply.delta' },
      {
        job: { id: job.id, status: 'completed' },
        session: {
          messages: [
            { content: 'Расскажи что-нибудь.', role: 'user' },
            { content: 'Первый кусок.', role: 'assistant' },
          ],
        },
        type: 'chat.session.updated',
      },
      { job: { id: job.id, status: 'completed' }, type: 'generation.job.updated' },
    ]);

    await stream.disconnect();
  });

  it('finishes the job and logs no write error when the client disconnects before the first job event', async () => {
    const provider = api().http.hold('POST', CHAT_COMPLETIONS_URL);
    const job = await startChatReplyJob('Ответь, когда я уйду.');
    await provider.started;
    const url = `${await api().listen()}/api/generation/jobs/${job.id}/events`;
    const serverSawClose = createDeferred();
    api().app.server.once('request', (request: http.IncomingMessage) => {
      request.once('close', () => serverSawClose.resolve());
    });
    const stream = await openJobEventStream(url);
    await stream.readUntil((event) => event.type === 'generation.job.snapshot');

    await stream.disconnect();
    await serverSawClose.promise;
    provider.release(openAiChatStream([{ content: 'Ответ ' }, { content: 'без слушателя.' }]));

    await waitForGenerationJob(api(), job.id, 'completed');
    expect(api().logs.lines.filter((line) => line.level === 'warn' || line.level === 'error')).toEqual([]);
  });
});
