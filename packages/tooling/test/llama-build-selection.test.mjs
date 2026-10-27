import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { asset, buildRelease, nightlyTagRelease, windowsAssetNames } from './llama-release-fixtures.mjs';
import { runPowerShellModule, scriptModule } from './powershell-module.mjs';

const temporaryRoots = [];

function selectBuild(releases, backend) {
  const workDirectory = mkdtempSync(path.join(tmpdir(), 'immersion-llama-build-'));
  temporaryRoots.push(workDirectory);
  const fixture = path.join(workDirectory, 'releases.json');
  writeFileSync(fixture, JSON.stringify(releases));
  return runPowerShellModule({
    env: { LLAMA_BACKEND: backend, LLAMA_RELEASES_FIXTURE: fixture },
    module: scriptModule('llama-build-selection.psm1'),
    script: [
      '  $releases = Get-Content -Raw -LiteralPath $env:LLAMA_RELEASES_FIXTURE | ConvertFrom-Json',
      '  $build = Select-LlamaBuild -Releases $releases -Backend $env:LLAMA_BACKEND',
      '  [Console]::Out.WriteLine($build.Tag)',
      '  foreach ($option in $build.Options) {',
      '    [Console]::Out.WriteLine((@($option.Main.name, $option.Runtime.name) | Where-Object { $_ }) -join " + ")',
      '  }',
    ],
    workDirectory,
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('llama-build-selection.psm1', {
  skip: process.platform !== 'win32' && 'install-llama.ps1 runs only on Windows',
}, () => {
  it('picks a prerelease bNNNNN build, because the latest llama.cpp release is a semver tag carrying only nightly-tag.txt', () => {
    assert.deepEqual(selectBuild([nightlyTagRelease(), buildRelease('b11912')], 'cpu'), [
      'b11912',
      'llama-b11912-bin-win-cpu-x64.zip',
    ]);
  });

  it('offers every CUDA version of the build with its own x64 runtime, never the arm64 one listed before it', () => {
    assert.deepEqual(selectBuild([buildRelease('b11912')], 'cuda'), [
      'b11912',
      'llama-b11912-bin-win-cuda-12.4-x64.zip + cudart-llama-bin-win-cuda-12.4-x64.zip',
      'llama-b11912-bin-win-cuda-13.4-x64.zip + cudart-llama-bin-win-cuda-13.4-x64.zip',
    ]);
  });

  it('selects the Vulkan x64 build, not the arm64 one', () => {
    assert.deepEqual(selectBuild([buildRelease('b11912')], 'vulkan'), [
      'b11912',
      'llama-b11912-bin-win-vulkan-x64.zip',
    ]);
  });

  it('leaves out a CUDA version whose runtime the build does not carry', () => {
    const names = windowsAssetNames('b11912').filter((name) => name !== 'cudart-llama-bin-win-cuda-13.4-x64.zip');
    const release = buildRelease(
      'b11912',
      names.map((name) => asset('b11912', name)),
    );

    assert.deepEqual(selectBuild([release], 'cuda'), [
      'b11912',
      'llama-b11912-bin-win-cuda-12.4-x64.zip + cudart-llama-bin-win-cuda-12.4-x64.zip',
    ]);
  });

  it('orders builds by number, not by tag text or list position', () => {
    assert.equal(selectBuild([buildRelease('b9999'), buildRelease('b11912')], 'cpu')[0], 'b11912');
  });

  it('falls back to an older build while the newest one has not uploaded the backend yet', () => {
    const uploading = buildRelease('b11912', [asset('b11912', 'llama-b11912-bin-win-cpu-x64.zip')]);

    assert.deepEqual(selectBuild([uploading, buildRelease('b11910')], 'vulkan'), [
      'b11910',
      'llama-b11910-bin-win-vulkan-x64.zip',
    ]);
  });

  it('skips drafts, tags that are not a bare build number, and a build number too long to count', () => {
    const releases = [
      buildRelease('b11913', undefined, true),
      buildRelease('b11912-rc'),
      buildRelease('master-b11911'),
      buildRelease(`b${'9'.repeat(19)}`),
      buildRelease('b11910'),
    ];

    assert.equal(selectBuild(releases, 'cpu')[0], 'b11910');
  });

  it('refuses a release list that holds no build', () => {
    assert.deepEqual(selectBuild([nightlyTagRelease()], 'cpu'), [
      'refused: No llama.cpp build (bNNNNN) among the latest releases.',
    ]);
  });

  it('refuses when no recent build carries the backend, naming the newest build', () => {
    const cpuOnly = buildRelease('b11912', [asset('b11912', 'llama-b11912-bin-win-cpu-x64.zip')]);

    assert.deepEqual(selectBuild([cpuOnly], 'cuda'), [
      "refused: No 'cuda' build among the latest llama.cpp builds (newest: b11912).",
    ]);
  });
});
