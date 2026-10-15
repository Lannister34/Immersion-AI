import fs from 'node:fs';
import os from 'node:os';

import { pruneStaleSmokeDataRoots } from './prune-stale-smoke-data-roots.js';
import { restoreDataRoot } from './restore-data-root.js';
import { isSmokeDataRoot, smokeDataRootPrefix } from './smoke-data-root-name.js';
import { smokeFixtureDirectory } from './smoke-fixture-directory.js';

const SMOKE_DATA_ROOT_VARIABLE = 'IMMERSION_SMOKE_DATA_ROOT';
const STALE_SMOKE_DATA_ROOT_AGE_MS = 24 * 60 * 60 * 1000;

function inheritedSmokeDataRoot() {
  const inherited = process.env[SMOKE_DATA_ROOT_VARIABLE];
  if (!inherited) {
    return undefined;
  }

  if (!isSmokeDataRoot(os.tmpdir(), inherited)) {
    throw new Error(
      `${SMOKE_DATA_ROOT_VARIABLE} is "${inherited}", which is not a smoke data root of this suite under ${os.tmpdir()}: unset it and let the run create its own.`,
    );
  }

  if (!fs.lstatSync(inherited, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(
      `${SMOKE_DATA_ROOT_VARIABLE} is "${inherited}", which is not a directory: a missing root, a link or a junction is not a smoke data root.`,
    );
  }

  return inherited;
}

function requiredSmokeDataRoot() {
  const root = inheritedSmokeDataRoot();
  if (!root) {
    throw new Error(`${SMOKE_DATA_ROOT_VARIABLE} is not set: the Playwright config creates the smoke data root.`);
  }

  return root;
}

export function ensureSmokeDataRoot() {
  const inherited = inheritedSmokeDataRoot();
  if (inherited) {
    return inherited;
  }

  const { failed } = pruneStaleSmokeDataRoots({
    maxAgeMs: STALE_SMOKE_DATA_ROOT_AGE_MS,
    now: Date.now(),
    parent: os.tmpdir(),
  });
  for (const { directory, error } of failed) {
    process.emitWarning(`Could not prune stale smoke data roots at ${directory}: ${String(error)}`);
  }

  const created = fs.mkdtempSync(smokeDataRootPrefix(os.tmpdir()));
  fs.cpSync(smokeFixtureDirectory, created, { recursive: true });
  process.env[SMOKE_DATA_ROOT_VARIABLE] = created;

  return created;
}

export async function resetSmokeData() {
  await restoreDataRoot(requiredSmokeDataRoot(), smokeFixtureDirectory);
}

export function removeSmokeDataRoot() {
  const root = requiredSmokeDataRoot();
  try {
    fs.rmSync(root, { force: true, maxRetries: 3, recursive: true });
  } catch (error) {
    process.emitWarning(`Could not remove the smoke data root ${root}; a later run prunes it: ${String(error)}`);
  }
}
