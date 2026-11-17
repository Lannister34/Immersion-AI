import { parseEnv } from 'node:util';

import { DevServerConfigError } from './dev-server-config.js';
import { DevServerEnvironmentSchema } from './dev-server-environment-schema.js';

const OWNED_KEY_PREFIX = 'IMMERSION_';
const DEV_SERVER_KEYS: readonly string[] = DevServerEnvironmentSchema.keyof().options;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

export function decodeLocalEnvFile(bytes: Uint8Array, fileName: string): Record<string, string> {
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) {
    throw new DevServerConfigError([`${fileName}: is UTF-16; save it as UTF-8`]);
  }

  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DevServerConfigError([`${fileName}: is not UTF-8; save it as UTF-8`]);
  }

  const env = parseEnv(text);
  const unknownKeys = Object.keys(env).filter(
    (key) => key.startsWith(OWNED_KEY_PREFIX) && !DEV_SERVER_KEYS.includes(key),
  );

  if (unknownKeys.length > 0) {
    throw new DevServerConfigError(unknownKeys.map((key) => `${fileName}: ${key} is not a dev server setting`));
  }

  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}
