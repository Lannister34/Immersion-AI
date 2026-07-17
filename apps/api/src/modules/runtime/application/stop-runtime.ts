import { getLlmProcessManager } from '../infrastructure/llm-process-manager.js';
import { getRuntimeOverview } from './get-runtime-overview.js';

export async function stopRuntime() {
  await getLlmProcessManager().stop();

  return getRuntimeOverview();
}
