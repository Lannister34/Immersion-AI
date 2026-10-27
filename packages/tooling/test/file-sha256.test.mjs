import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { sha256Digest } from './llama-release-fixtures.mjs';
import { runPowerShellModule, scriptModule } from './powershell-module.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('file-sha256.psm1', { skip: process.platform !== 'win32' && 'install-llama.ps1 runs only on Windows' }, () => {
  it('accepts a downloaded file whose sha256 matches, skips the check without a digest, and refuses a mismatch', () => {
    const workDirectory = mkdtempSync(path.join(tmpdir(), 'immersion-file-sha256-'));
    temporaryRoots.push(workDirectory);
    const folder = path.join(workDirectory, 'загрузка с пробелом');
    mkdirSync(folder);
    const file = path.join(folder, 'llama.zip');
    writeFileSync(file, 'llama archive bytes');

    const lines = runPowerShellModule({
      env: { LLAMA_SHA256: sha256Digest('llama archive bytes').slice('sha256:'.length), LLAMA_ZIP: file },
      module: scriptModule('file-sha256.psm1'),
      script: [
        '  Assert-FileSha256 -Path $env:LLAMA_ZIP -Expected $env:LLAMA_SHA256 -Name llama.zip',
        "  [Console]::Out.WriteLine('matched')",
        '  Assert-FileSha256 -Path $env:LLAMA_ZIP -Expected $null -Name llama.zip',
        "  [Console]::Out.WriteLine('skipped')",
        "  Assert-FileSha256 -Path $env:LLAMA_ZIP -Expected ('0' * 64) -Name llama.zip",
      ],
      workDirectory,
    });

    assert.deepEqual(lines, [
      'matched',
      'skipped',
      'refused: Checksum of llama.zip does not match the digest published with the release.',
    ]);
  });
});
