import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { REPOSITORY } from './repository-git.mjs';

const START_BAT = path.join(REPOSITORY, 'start.bat');
const COREPACK_STUB = [
  '@echo off',
  'setlocal EnableDelayedExpansion',
  '>>"%STUB_LOG%" echo(!cd!',
  '>>"%STUB_LOG%" echo(%*',
  'exit /b 7',
  '',
].join('\r\n');
const temporaryRoots = [];

function withStubFirstOnPath(bin) {
  const env = { ...process.env };
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = `${bin}${path.delimiter}${env[pathKey] ?? ''}`;
  return env;
}

function runCopiedStartBat() {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-start-bat-'));
  temporaryRoots.push(root);
  const launcherFolder = path.join(root, 'запуск с пробелом');
  const bin = path.join(root, 'bin');
  const stubLog = path.join(root, 'corepack.log');
  const callerLog = path.join(root, 'caller.log');
  mkdirSync(launcherFolder);
  mkdirSync(bin);
  copyFileSync(START_BAT, path.join(launcherFolder, 'start.bat'));
  writeFileSync(path.join(bin, 'corepack.cmd'), COREPACK_STUB);

  const callerSession = [
    `call "${path.join(launcherFolder, 'start.bat')}"`,
    `>"${callerLog}" call echo exit %^errorlevel%`,
    `>>"${callerLog}" cd`,
    `cd /d "${bin}"`,
    'popd',
    `>>"${callerLog}" cd`,
    `>>"${callerLog}" set launch_status`,
  ].join(' & ');
  const run = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${callerSession}"`], {
    cwd: root,
    encoding: 'utf8',
    env: { ...withStubFirstOnPath(bin), STUB_LOG: stubLog },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    windowsHide: true,
    windowsVerbatimArguments: true,
  });
  const linesOf = (file) =>
    readFileSync(file, 'utf8')
      .split('\r\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);
  return { bin, callerLines: linesOf(callerLog), corepackCalls: linesOf(stubLog), launcherFolder, root, run };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('start.bat', { skip: process.platform !== 'win32' && 'start.bat runs only on Windows' }, () => {
  it('installs exactly the lockfile from its own folder, whatever directory it starts in', () => {
    const { callerLines, corepackCalls, launcherFolder, run } = runCopiedStartBat();

    assert.deepEqual(corepackCalls, [launcherFolder, 'pnpm install --frozen-lockfile']);
    assert.equal(callerLines[0], 'exit 1', run.stdout);
    assert.match(run.stdout, /\[ERROR\] Install failed/);
  });

  it('hands the console back in the folder it started in, with nothing left on the pushd stack and no variable of its own', () => {
    const { bin, callerLines, root } = runCopiedStartBat();

    assert.deepEqual(callerLines.slice(1), [root, bin]);
  });
});
