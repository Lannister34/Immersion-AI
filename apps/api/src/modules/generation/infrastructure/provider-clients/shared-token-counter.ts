import { systemClock } from '../../../../platform/clock/system-clock.js';
import { globalHttpFetch } from '../../../../platform/outbound-http/global-http-fetch.js';
import { ProviderTokenCounter } from './token-counter.js';

let sharedProviderTokenCounter: ProviderTokenCounter | null = null;

export function getProviderTokenCounter(): ProviderTokenCounter {
  if (!sharedProviderTokenCounter) {
    // TODO: construct one token counter per app in the composition root and delete this singleton (F-35)
    sharedProviderTokenCounter = new ProviderTokenCounter({ clock: systemClock, httpFetch: globalHttpFetch });
  }

  return sharedProviderTokenCounter;
}
