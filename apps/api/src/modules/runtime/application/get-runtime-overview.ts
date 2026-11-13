import path from 'node:path';

import {
  type RuntimeModelSummary,
  type RuntimeOverviewResponse,
  RuntimeOverviewResponseSchema,
} from '@immersion/contracts/runtime';

import { isSameModelFile } from '../domain/same-model-file.js';
import type { ModelScanner, ScannedModelSummary } from './model-scanner.js';
import type { RuntimeConfigRepository } from './runtime-config-repository.js';
import type { RuntimeProcess } from './runtime-process.js';

export interface GetRuntimeOverviewDependencies {
  readonly dataRoot: string;
  readonly modelScanner: Pick<ModelScanner, 'scan'>;
  readonly runtimeConfig: Pick<RuntimeConfigRepository, 'read'>;
  readonly runtimeProcess: Pick<RuntimeProcess, 'getEngineInfo' | 'getState'>;
}

function markActiveModel(models: ScannedModelSummary[], activeModelPath: string | null): RuntimeModelSummary[] {
  return models.map((model) => ({
    ...model,
    isActive: activeModelPath !== null && isSameModelFile(model.path, activeModelPath, process.platform),
  }));
}

export async function getRuntimeOverview({
  dataRoot,
  modelScanner,
  runtimeConfig,
  runtimeProcess,
}: GetRuntimeOverviewDependencies): Promise<RuntimeOverviewResponse> {
  const engine = runtimeProcess.getEngineInfo();
  const serverStatus = runtimeProcess.getState();
  const config = runtimeConfig.read();
  const modelsDirs = config.modelsDirs.map((directory) =>
    path.isAbsolute(directory) ? directory : path.resolve(dataRoot, directory),
  );

  const scan = await modelScanner.scan(modelsDirs);

  return RuntimeOverviewResponseSchema.parse({
    engine,
    serverStatus,
    serverConfig: {
      ...config,
      modelsDirs,
    },
    models: markActiveModel(scan.models, serverStatus.modelPath),
    modelsDirsStatus: scan.directories,
  });
}
