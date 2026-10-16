import http from 'node:http';

import {
  type GenerationJobDto,
  GenerationJobEventSchema,
  type GenerationJobStatus,
} from '@immersion/contracts/generation';
import { onTestFinished } from 'vitest';

import { createServerSentEventDataDecoder } from './server-sent-event-data.js';
import type { TestApi } from './test-api.js';

const SETTLED_STATUSES: ReadonlySet<GenerationJobStatus> = new Set(['canceled', 'completed', 'failed']);

export async function waitForGenerationJob(
  api: Pick<TestApi, 'listen'>,
  jobId: string,
  status: GenerationJobStatus,
): Promise<GenerationJobDto> {
  const stopped = new AbortController();
  onTestFinished(() =>
    stopped.abort(new Error(`The test finished while waiting for generation job ${jobId} to be ${status}.`)),
  );
  const origin = await api.listen();
  const url = `${origin}/api/generation/jobs/${encodeURIComponent(jobId)}/events`;

  return new Promise<GenerationJobDto>((resolve, reject) => {
    let settled = false;
    let lastStatus: GenerationJobStatus | null = null;
    const decoder = createServerSentEventDataDecoder();

    const request = http.get(url, { agent: false, signal: stopped.signal }, (response) => {
      response.setEncoding('utf8');
      response.on('error', failOnSocket);
      response.on('end', () =>
        fail(new Error(`The event stream of generation job ${jobId} ended at status ${lastStatus}, not ${status}.`)),
      );

      if (response.statusCode !== 200) {
        fail(new Error(`The event stream of generation job ${jobId} answered HTTP ${response.statusCode}.`));
        return;
      }

      response.on('data', (chunk: string) => {
        try {
          for (const data of decoder.push(chunk)) {
            readJob(GenerationJobEventSchema.parse(JSON.parse(data)).job);
          }
        } catch (error) {
          fail(error);
        }
      });
    });
    request.on('error', failOnSocket);

    function readJob(job: GenerationJobDto) {
      lastStatus = job.status;

      if (job.status === status) {
        finish(() => resolve(job));
        return;
      }

      if (SETTLED_STATUSES.has(job.status)) {
        fail(
          new Error(
            `Generation job ${jobId} settled as ${job.status}, not ${status}: ${JSON.stringify(job.error ?? null)}`,
          ),
        );
      }
    }

    function failOnSocket(error: unknown) {
      fail(stopped.signal.aborted ? stopped.signal.reason : error);
    }

    function fail(error: unknown) {
      finish(() => reject(error));
    }

    function finish(settle: () => void) {
      if (settled) {
        return;
      }

      settled = true;
      request.destroy();
      settle();
    }
  });
}
