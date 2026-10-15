import path from 'node:path';

const SMOKE_DATA_ROOT_PREFIX = 'immersion-web-smoke-';
const SMOKE_DATA_ROOT_NAME = new RegExp(`^${SMOKE_DATA_ROOT_PREFIX}[A-Za-z0-9]{6}$`);

export function smokeDataRootPrefix(parent: string) {
  return path.join(parent, SMOKE_DATA_ROOT_PREFIX);
}

export function isSmokeDataRoot(parent: string, candidate: string) {
  return (
    path.dirname(path.resolve(candidate)) === path.resolve(parent) &&
    SMOKE_DATA_ROOT_NAME.test(path.basename(candidate))
  );
}
