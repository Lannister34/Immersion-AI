import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { decodeLocalEnvFile } from './decode-local-env-file.js';
import { type DevServerConfig, parseDevServerConfig } from './dev-server-config.js';
import { mergeDevServerEnvironment } from './merge-dev-server-environment.js';

const LOCAL_ENV_FILE = fileURLToPath(new URL('../.env.local', import.meta.url));

function readLocalEnvFile(path: string): Record<string, string> {
  let bytes: Uint8Array;

  try {
    bytes = readFileSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
    throw error;
  }

  return decodeLocalEnvFile(bytes, path);
}

export function readDevServerConfig(
  localEnvFile: string = LOCAL_ENV_FILE,
  processEnv: Readonly<Record<string, string | undefined>> = process.env,
): DevServerConfig {
  return parseDevServerConfig(mergeDevServerEnvironment(readLocalEnvFile(localEnvFile), processEnv));
}
