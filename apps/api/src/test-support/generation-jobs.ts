import type { GenerationJobDto, GenerationJobStatus } from '@immersion/contracts/generation';
import { onTestFinished } from 'vitest';

import type { TestApi } from './test-api.js';

const SETTLED_STATUSES: ReadonlySet<GenerationJobStatus> = new Set(['canceled', 'completed', 'failed']);

export function waitForGenerationJob(
  api: Pick<TestApi, 'dependencies'>,
  jobId: string,
  status: GenerationJobStatus,
): Promise<GenerationJobDto> {
  const registry = api.dependencies.generationJobs;

  return new Promise<GenerationJobDto>((resolve, reject) => {
    let settled = false;
    let unsubscribe: () => void = () => undefined;

    function finish(settle: () => void) {
      if (settled) {
        return;
      }

      settled = true;
      unsubscribe();
      settle();
    }

    function readJob(job: GenerationJobDto) {
      if (job.status === status) {
        finish(() => resolve(job));
        return;
      }

      if (SETTLED_STATUSES.has(job.status)) {
        finish(() =>
          reject(
            new Error(
              `Generation job ${jobId} settled as ${job.status}, not ${status}: ${JSON.stringify(job.error ?? null)}`,
            ),
          ),
        );
      }
    }

    const current = registry.get(jobId);

    if (!current) {
      reject(new Error(`The api knows no generation job ${jobId}.`));
      return;
    }

    unsubscribe = registry.subscribe(jobId, (event) => readJob(event.job));
    onTestFinished(() =>
      finish(() => reject(new Error(`The test finished while waiting for generation job ${jobId} to be ${status}.`))),
    );
    readJob(current);
  });
}
