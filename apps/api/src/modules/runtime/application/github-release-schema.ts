import { z } from 'zod';

export const GitHubReleaseAssetSchema = z.object({
  browser_download_url: z.url({ protocol: /^https$/ }),
  name: z.string().min(1),
});
export type GitHubReleaseAsset = z.infer<typeof GitHubReleaseAssetSchema>;

export const GitHubReleaseSchema = z.object({
  assets: z.array(GitHubReleaseAssetSchema),
  tag_name: z.string().min(1),
});
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;
