import { createHash } from 'node:crypto';

import {
  countTokensHeuristic,
  type TokenCounter,
  type TokenCountResult,
} from '../../prompting/application/token-counter.js';
import { getProviderSettings } from '../../providers/index.js';
import { getRunningRuntimeEndpoint } from '../../runtime/index.js';

const TOKENIZE_TIMEOUT_MS = 2000;
const ABSENT_RETRY_MS = 60_000;
const MAX_CACHED_COUNTS = 4096;

type TokenizeEndpointKind = 'kobold' | 'llama';

type TokenizeCapability = { kind: TokenizeEndpointKind } | { kind: 'absent'; retryAtMs: number };

export interface TokenizeTarget {
  baseUrl: string;
  model: string | null;
}

export interface ProviderTokenCounterDependencies {
  now?: () => number;
  resolveTokenizeTarget?: () => Promise<TokenizeTarget | null>;
}

async function resolveBuiltinRuntimeTarget(): Promise<TokenizeTarget | null> {
  try {
    const settings = await getProviderSettings();

    if (settings.mode !== 'builtin') {
      return null;
    }

    const endpoint = await getRunningRuntimeEndpoint();

    if (!endpoint) {
      return null;
    }

    return { baseUrl: endpoint.baseUrl, model: endpoint.model };
  } catch {
    return null;
  }
}

function hashText(text: string): string {
  return createHash('sha1').update(text).digest('base64');
}

async function postJson(url: string, body: Record<string, string>): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(TOKENIZE_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  return payload as Record<string, unknown>;
}

function parseLlamaTokenCount(payload: Record<string, unknown> | null): number | null {
  if (!payload || !Array.isArray(payload.tokens)) {
    return null;
  }

  return payload.tokens.length;
}

function parseKoboldTokenCount(payload: Record<string, unknown> | null): number | null {
  if (!payload || typeof payload.value !== 'number' || !Number.isFinite(payload.value) || payload.value < 0) {
    return null;
  }

  return Math.floor(payload.value);
}

async function requestTokenCount(baseUrl: string, kind: TokenizeEndpointKind, text: string): Promise<number | null> {
  if (kind === 'llama') {
    return parseLlamaTokenCount(await postJson(`${baseUrl}/tokenize`, { content: text }));
  }

  return parseKoboldTokenCount(await postJson(`${baseUrl}/api/extra/tokencount`, { prompt: text }));
}

export class ProviderTokenCounter implements TokenCounter {
  private readonly capabilities = new Map<string, TokenizeCapability>();
  private readonly countCache = new Map<string, number>();
  private readonly now: () => number;
  private readonly resolveTokenizeTarget: () => Promise<TokenizeTarget | null>;

  constructor(dependencies: ProviderTokenCounterDependencies = {}) {
    this.now = dependencies.now ?? (() => Date.now());
    this.resolveTokenizeTarget = dependencies.resolveTokenizeTarget ?? resolveBuiltinRuntimeTarget;
  }

  async countTokens(texts: string[]): Promise<TokenCountResult> {
    const target = await this.resolveTokenizeTarget();

    if (!target) {
      return countTokensHeuristic(texts);
    }

    const kind = await this.resolveCapability(target.baseUrl);

    if (kind === null) {
      return countTokensHeuristic(texts);
    }

    try {
      const counts: number[] = [];

      for (const text of texts) {
        counts.push(await this.countText(target, kind, text));
      }

      return { counts, method: 'exact' };
    } catch {
      this.markAbsent(target.baseUrl);

      return countTokensHeuristic(texts);
    }
  }

  private async resolveCapability(baseUrl: string): Promise<TokenizeEndpointKind | null> {
    const cached = this.capabilities.get(baseUrl);

    if (cached) {
      if (cached.kind !== 'absent') {
        return cached.kind;
      }

      if (this.now() < cached.retryAtMs) {
        return null;
      }
    }

    const detected = await this.detectCapability(baseUrl);

    if (detected === null) {
      this.markAbsent(baseUrl);

      return null;
    }

    this.capabilities.set(baseUrl, { kind: detected });

    return detected;
  }

  private async detectCapability(baseUrl: string): Promise<TokenizeEndpointKind | null> {
    for (const kind of ['llama', 'kobold'] as const) {
      const probeCount = await requestTokenCount(baseUrl, kind, '').catch(() => null);

      if (probeCount !== null) {
        return kind;
      }
    }

    return null;
  }

  private markAbsent(baseUrl: string) {
    this.capabilities.set(baseUrl, { kind: 'absent', retryAtMs: this.now() + ABSENT_RETRY_MS });
  }

  private async countText(target: TokenizeTarget, kind: TokenizeEndpointKind, text: string): Promise<number> {
    const { baseUrl } = target;
    const cacheKey = [baseUrl, target.model ?? '', kind, hashText(text)].join('\u0000');
    const cachedCount = this.countCache.get(cacheKey);

    if (cachedCount !== undefined) {
      this.countCache.delete(cacheKey);
      this.countCache.set(cacheKey, cachedCount);

      return cachedCount;
    }

    const count = await requestTokenCount(baseUrl, kind, text);

    if (count === null) {
      throw new Error(`Tokenize request failed for ${baseUrl}`);
    }

    if (this.countCache.size >= MAX_CACHED_COUNTS) {
      const oldestKey = this.countCache.keys().next().value;

      if (oldestKey !== undefined) {
        this.countCache.delete(oldestKey);
      }
    }

    this.countCache.set(cacheKey, count);

    return count;
  }
}

let sharedProviderTokenCounter: ProviderTokenCounter | null = null;

export function getProviderTokenCounter(): ProviderTokenCounter {
  if (!sharedProviderTokenCounter) {
    sharedProviderTokenCounter = new ProviderTokenCounter();
  }

  return sharedProviderTokenCounter;
}
