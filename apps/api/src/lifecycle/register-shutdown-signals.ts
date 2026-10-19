import type { LogPort } from '../platform/logging/log-port.js';

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface ShutdownSignalSource {
  once(signal: ShutdownSignal, listener: () => void): unknown;
}

export interface ClosableApi {
  close(): Promise<unknown>;
  readonly log: LogPort;
}

export interface ShutdownSignalOptions {
  readonly signals: ShutdownSignalSource;
  readonly exit: (code: number) => void;
  readonly deadlineMs: number;
}

const SHUTDOWN_SIGNALS: readonly ShutdownSignal[] = ['SIGINT', 'SIGTERM'];

async function closeBeforeDeadline(app: ClosableApi, deadlineMs: number): Promise<number> {
  let deadlineTimer: NodeJS.Timeout | undefined;
  const deadlinePassed = new Promise<'deadline'>((resolve) => {
    deadlineTimer = setTimeout(() => resolve('deadline'), deadlineMs);
  });

  try {
    const outcome = await Promise.race([app.close().then(() => 'closed' as const), deadlinePassed]);

    if (outcome === 'deadline') {
      app.log.error({ deadlineMs }, 'API did not close before the shutdown deadline');

      return 1;
    }

    return 0;
  } catch (error) {
    app.log.error({ err: error }, 'API failed to close');

    return 1;
  } finally {
    clearTimeout(deadlineTimer);
  }
}

export function registerShutdownSignals(app: ClosableApi, { signals, exit, deadlineMs }: ShutdownSignalOptions): void {
  let closing = false;

  function shutDown(signal: ShutdownSignal) {
    if (closing) {
      return;
    }

    closing = true;
    app.log.info({ signal }, 'API shutting down');
    void closeBeforeDeadline(app, deadlineMs).then(exit);
  }

  for (const signal of SHUTDOWN_SIGNALS) {
    signals.once(signal, () => shutDown(signal));
  }
}
