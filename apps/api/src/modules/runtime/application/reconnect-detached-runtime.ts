import type { LogPort } from '../../../platform/logging/log-port.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface ReconnectDetachedRuntimeDependencies {
  readonly logger: LogPort;
  readonly runtimeProcess: Pick<RuntimeProcess, 'getState' | 'reconnect'>;
}

export async function reconnectDetachedRuntime({
  logger,
  runtimeProcess,
}: ReconnectDetachedRuntimeDependencies): Promise<void> {
  try {
    await runtimeProcess.reconnect();

    const { status, model, port, pid } = runtimeProcess.getState();

    logger.info({ status, model, port, pid }, 'llm-process: reconnect finished');
  } catch (error) {
    logger.error({ err: error }, 'llm-process: reconnect error');
  }
}
