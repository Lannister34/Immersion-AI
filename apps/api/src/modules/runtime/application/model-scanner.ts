import type { RuntimeModelSummary, RuntimeModelsDirStatus } from '@immersion/contracts/runtime';

export type ScannedModelSummary = Omit<RuntimeModelSummary, 'isActive'>;

export interface RuntimeModelScanResult {
  directories: RuntimeModelsDirStatus[];
  models: ScannedModelSummary[];
}

export interface ModelScanner {
  scan(modelsDirs: readonly string[]): Promise<RuntimeModelScanResult>;
  invalidate(): void;
}
