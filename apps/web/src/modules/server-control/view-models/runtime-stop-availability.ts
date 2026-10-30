import type { RuntimeServerStatus } from '@immersion/contracts/runtime';

const RUNTIME_STOPPABLE_BY_STATUS: Record<RuntimeServerStatus, boolean> = {
  idle: false,
  starting: false,
  running: true,
  stopping: false,
  error: true,
};

export function canStopRuntime(status: RuntimeServerStatus): boolean {
  return RUNTIME_STOPPABLE_BY_STATUS[status];
}
