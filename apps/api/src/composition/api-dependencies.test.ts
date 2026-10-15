import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { parseApiConfig } from '../config/api-config.js';
import type { Clock } from '../platform/clock/clock.js';
import { systemClock } from '../platform/clock/system-clock.js';
import { globalHttpFetch } from '../platform/outbound-http/global-http-fetch.js';
import type { HttpFetch } from '../platform/outbound-http/http-fetch.js';
import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { createApiDependencies } from './api-dependencies.js';

const projectRoot = path.join(os.tmpdir(), 'Проекты', 'Immersion AI');

describe('createApiDependencies', () => {
  it('honours overrides for clock, httpFetch and logger', () => {
    const clock: Clock = { now: () => new Date('2026-10-15T09:00:00.000Z') };
    const httpFetch = vi.fn<HttpFetch>();
    const { logger } = createCapturingLogger();

    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot), { clock, httpFetch, logger });

    expect(dependencies.clock).toBe(clock);
    expect(dependencies.httpFetch).toBe(httpFetch);
    expect(dependencies.logger).toBe(logger);
  });

  it('falls back to the system clock and the global fetch', () => {
    const dependencies = createApiDependencies(parseApiConfig({}, projectRoot));

    expect(dependencies.clock).toBe(systemClock);
    expect(dependencies.httpFetch).toBe(globalHttpFetch);
  });

  it('creates the logger at the configured level', () => {
    for (const level of ['silent', 'warn', 'trace'] as const) {
      const config = parseApiConfig({ IMMERSION_LOG_LEVEL: level }, projectRoot);

      expect(createApiDependencies(config).logger.level).toBe(level);
    }
  });
});
