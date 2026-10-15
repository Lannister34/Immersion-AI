import type { LogPort } from '../../../platform/logging/log-port.js';
import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';

export async function reconnectDetachedRuntime(logger: LogPort): Promise<void> {
  try {
    const manager = getLlmProcessManager();

    await manager.reconnectToDetachedRuntime();

    const { status, model, port, pid } = manager.getState();

    logger.info({ status, model, port, pid }, 'llm-process: reconnect finished');
  } catch (error) {
    logger.error({ err: error }, 'llm-process: reconnect error');
  }
}
