import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { runPowerShellModule, scriptModule } from './powershell-module.mjs';

const temporaryRoots = [];

function readDigests(script) {
  const workDirectory = mkdtempSync(path.join(tmpdir(), 'immersion-llama-digest-'));
  temporaryRoots.push(workDirectory);
  return runPowerShellModule({ module: scriptModule('llama-asset-digest.psm1'), script, workDirectory });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('llama-asset-digest.psm1', {
  skip: process.platform !== 'win32' && 'install-llama.ps1 runs only on Windows',
}, () => {
  it('reads a sha256 digest as lower-case hex and nothing for a missing one', () => {
    const hex = createHash('sha256').update('llama').digest('hex');

    assert.deepEqual(
      readDigests([
        `  [Console]::Out.WriteLine((Get-AssetSha256 ([pscustomobject]@{ name = 'a.zip'; digest = 'sha256:${hex}' })))`,
        `  [Console]::Out.WriteLine((Get-AssetSha256 ([pscustomobject]@{ name = 'b.zip'; digest = 'sha256:${hex.toUpperCase()}' })))`,
        "  [Console]::Out.WriteLine('none:' + (Get-AssetSha256 ([pscustomobject]@{ name = 'c.zip'; digest = $null })))",
        "  [Console]::Out.WriteLine('none:' + (Get-AssetSha256 ([pscustomobject]@{ name = 'd.zip' })))",
      ]),
      [hex, hex, 'none:', 'none:'],
    );
  });

  it('refuses a digest that is not a sha256 of 64 hex digits', () => {
    const hex = createHash('sha256').update('llama').digest('hex');

    for (const digest of ['md5:0123456789abcdef', `sha256:${hex.slice(1)}`, `sha512:${hex}${hex}`, hex]) {
      assert.deepEqual(readDigests([`  Get-AssetSha256 ([pscustomobject]@{ name = 'a.zip'; digest = '${digest}' })`]), [
        `refused: Unknown checksum format for a.zip: ${digest}`,
      ]);
    }
  });
});
