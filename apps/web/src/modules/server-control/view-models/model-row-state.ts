import type { RuntimeModelSummary, RuntimeServerStatus, RuntimeStatusSnapshot } from '@immersion/contracts/runtime';

export interface ModelRowState {
  canStart: boolean;
  isActive: boolean;
}

const ACTIVE_MODEL_STARTABLE_BY_STATUS: Record<RuntimeServerStatus, boolean> = {
  idle: true,
  starting: false,
  running: false,
  stopping: false,
  error: true,
};

export function toModelRowState(
  model: Pick<RuntimeModelSummary, 'isActive'>,
  serverStatus: Pick<RuntimeStatusSnapshot, 'status'>,
): ModelRowState {
  return {
    canStart: !model.isActive || ACTIVE_MODEL_STARTABLE_BY_STATUS[serverStatus.status],
    isActive: model.isActive,
  };
}
