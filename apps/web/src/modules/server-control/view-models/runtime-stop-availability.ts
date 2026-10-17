import type { RuntimeServerStatus } from '@immersion/contracts/runtime';

const CAN_STOP_RUNTIME: Record<RuntimeServerStatus, boolean> = {
  idle: false,
  starting: false,
  running: true,
  stopping: false,
  error: true,
};

export function canStopRuntime(status: RuntimeServerStatus): boolean {
  return CAN_STOP_RUNTIME[status];
}
