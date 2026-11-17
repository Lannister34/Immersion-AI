import type { PatchProviderSettingsCommand } from '@immersion/contracts/providers';

import type { ProviderConfig } from './provider-settings-schema.js';
import { isSameProviderOrigin } from './provider-url-origin.js';

type ProviderConfigPatch = NonNullable<PatchProviderSettingsCommand['config']>;

function movesToAnotherOrigin(currentUrl: string, nextUrl: string): boolean {
  return nextUrl.trim() !== currentUrl.trim() && !isSameProviderOrigin(currentUrl, nextUrl);
}

export function mergeProviderConfig(current: ProviderConfig, patch: ProviderConfigPatch | undefined): ProviderConfig {
  const next: ProviderConfig = { ...current };

  if (!patch) {
    return next;
  }

  const originChanged = patch.url ? movesToAnotherOrigin(current.url, patch.url) : false;

  if (patch.url) {
    next.url = patch.url;
  }

  if (patch.model !== undefined) {
    if (patch.model.length > 0) {
      next.model = patch.model;
    } else {
      delete next.model;
    }
  }

  const newApiKey = patch.apiKey?.trim() ?? '';

  if (newApiKey.length > 0) {
    next.apiKey = newApiKey;
  } else if (patch.apiKey !== undefined || originChanged) {
    delete next.apiKey;
  }

  return next;
}
