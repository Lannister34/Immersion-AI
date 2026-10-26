import type { RuntimeInstallVariant } from '@immersion/contracts/runtime';
import { describe, expect, it } from 'vitest';

import {
  type LlamaCppReleaseFixture,
  llamaCppAsset,
  llamaCppBuildRelease,
  llamaCppNightlyTagRelease,
} from '../../../test-support/llama-cpp-releases.js';
import { GitHubReleaseListSchema } from './github-release-schema.js';
import { type RuntimeInstallPlan, selectRuntimeInstallPlan } from './select-runtime-install-plan.js';

function plan(releases: readonly LlamaCppReleaseFixture[], variant: RuntimeInstallVariant): RuntimeInstallPlan {
  return selectRuntimeInstallPlan(GitHubReleaseListSchema.parse(releases), variant);
}

describe('selectRuntimeInstallPlan', () => {
  it('picks a prerelease bNNNNN build, because the latest llama.cpp release is a semver tag carrying only nightly-tag.txt', () => {
    const selected = plan([llamaCppNightlyTagRelease(), llamaCppBuildRelease('b11912')], 'cpu');

    expect(selected.releaseTag).toBe('b11912');
    expect(selected.assets.map((asset) => asset.name)).toEqual(['llama-b11912-bin-win-cpu-x64.zip']);
  });

  it.each<[RuntimeInstallVariant, string[]]>([
    ['cpu', ['llama-b11912-bin-win-cpu-x64.zip']],
    ['cuda-12.4', ['llama-b11912-bin-win-cuda-12.4-x64.zip', 'cudart-llama-bin-win-cuda-12.4-x64.zip']],
    ['cuda-13.4', ['llama-b11912-bin-win-cuda-13.4-x64.zip', 'cudart-llama-bin-win-cuda-13.4-x64.zip']],
    ['vulkan', ['llama-b11912-bin-win-vulkan-x64.zip']],
  ])('selects the %s assets of build b11912 by their published names', (variant, names) => {
    const selected = plan([llamaCppBuildRelease('b11912')], variant);

    expect(selected.assets.map((asset) => asset.name)).toEqual(names);
  });

  it('orders builds by number, not by tag text or list position', () => {
    const selected = plan([llamaCppBuildRelease('b9999'), llamaCppBuildRelease('b11912')], 'cpu');

    expect(selected.releaseTag).toBe('b11912');
  });

  it('falls back to an older build while the newest one has not uploaded the variant yet', () => {
    const uploading = llamaCppBuildRelease('b11912', [llamaCppAsset('b11912', 'llama-b11912-bin-win-cpu-x64.zip')]);

    const selected = plan([uploading, llamaCppBuildRelease('b11910')], 'cuda-13.4');

    expect(selected.releaseTag).toBe('b11910');
    expect(selected.assets.map((asset) => asset.name)).toEqual([
      'llama-b11910-bin-win-cuda-13.4-x64.zip',
      'cudart-llama-bin-win-cuda-13.4-x64.zip',
    ]);
  });

  it('skips drafts and tags that are not a bare build number', () => {
    const selected = plan(
      [
        llamaCppBuildRelease('b11913', undefined, true),
        llamaCppBuildRelease('b11912-rc'),
        llamaCppBuildRelease('master-b11911'),
        llamaCppBuildRelease('b11910'),
      ],
      'cpu',
    );

    expect(selected.releaseTag).toBe('b11910');
  });

  it('refuses a release list that holds no build', () => {
    expect(() => plan([llamaCppNightlyTagRelease()], 'cpu')).toThrow(
      'Среди последних релизов llama.cpp не найдено ни одной сборки.',
    );
  });

  it('names the asset the newest build lacks when no build carries the variant', () => {
    const cpuOnly = llamaCppBuildRelease('b11912', [llamaCppAsset('b11912', 'llama-b11912-bin-win-cpu-x64.zip')]);

    expect(() => plan([cpuOnly], 'cuda-12.4')).toThrow(
      'В последних сборках llama.cpp (до b11912) не найден asset llama-b11912-bin-win-cuda-12.4-x64.zip.',
    );
  });

  it('accepts assets that GitHub published before it computed digests', () => {
    const undigested = llamaCppAsset('b8766', 'llama-b8766-bin-win-cpu-x64.zip', null);

    const selected = plan([llamaCppBuildRelease('b8766', [undigested])], 'cpu');

    expect(selected.assets.map((asset) => asset.digest)).toEqual([null]);
  });
});
