import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPOSITORY } from './repository-git.mjs';

export function scriptModule(fileName) {
  return path.join(REPOSITORY, 'scripts', fileName);
}

export function runPowerShellModule({ env = {}, module, script, workDirectory }) {
  const scriptFile = path.join(workDirectory, 'run.ps1');
  writeFileSync(
    scriptFile,
    [
      "$ErrorActionPreference = 'Stop'",
      'try {',
      '  Import-Module -Name $env:POWERSHELL_TEST_MODULE -Force',
      ...script,
      '} catch {',
      "  [Console]::Out.WriteLine('refused: ' + $_.Exception.Message)",
      '  exit 3',
      '}',
    ].join('\r\n'),
  );
  const run = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptFile],
    {
      encoding: 'utf8',
      env: { ...process.env, ...env, POWERSHELL_TEST_MODULE: module },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
    },
  );
  assert.equal(run.error, undefined, `powershell.exe did not run: ${run.error}`);
  assert.equal(run.stderr, '', `powershell.exe wrote to stderr:\n${run.stderr}`);
  return run.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}
