import { ProviderTokenCounter } from './token-counter.js';

let sharedProviderTokenCounter: ProviderTokenCounter | null = null;

export function getProviderTokenCounter(): ProviderTokenCounter {
  if (!sharedProviderTokenCounter) {
    sharedProviderTokenCounter = new ProviderTokenCounter();
  }

  return sharedProviderTokenCounter;
}
