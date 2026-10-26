import { z } from 'zod';

export const GitHubReleaseAssetSchema = z.object({
  browser_download_url: z.url({ protocol: /^https$/ }),
  digest: z.string().nullish(),
  name: z.string().min(1),
});
export type GitHubReleaseAsset = z.infer<typeof GitHubReleaseAssetSchema>;

export const GitHubReleaseSchema = z.object({
  assets: z.array(GitHubReleaseAssetSchema),
  draft: z.boolean(),
  tag_name: z.string().min(1),
});
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

export const GitHubReleaseListSchema = z.array(GitHubReleaseSchema);
