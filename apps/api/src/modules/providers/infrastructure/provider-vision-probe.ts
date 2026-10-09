import type { VisionSupport } from '@immersion/contracts/generation';
import type { ProviderType } from '@immersion/contracts/providers';

import { normalizeGenerationProviderBaseUrl } from '../application/generation-provider.js';

const PROBE_TIMEOUT_MS = 1500;
const KNOWN_TTL_MS = 60_000;
const UNKNOWN_TTL_MS = 30_000;

export interface VisionProbeTarget {
  baseUrl: string;
  model: string | null;
  provider?: ProviderType | null;
}

export interface VisionProbeDependencies {
  fetchJson?: (url: string) => Promise<unknown>;
  now?: () => number;
}

interface CachedSupport {
  expiresAtMs: number;
  support: VisionSupport;
}

async function fetchJsonOverHttp(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function resolveProviderOrigin(baseUrl: string): string {
  return normalizeGenerationProviderBaseUrl(baseUrl).replace(/\/v1$/u, '');
}

function readLlamaProps(payload: unknown): VisionSupport {
  const modalities = asRecord(asRecord(payload)?.modalities);

  if (!modalities || typeof modalities.vision !== 'boolean') {
    return 'unknown';
  }

  return modalities.vision ? 'supported' : 'unsupported';
}

const TEXT_ONLY_MODEL_PATTERNS = [/^claude-2/u, /^claude-instant/u, /^gpt-3\.5/u, /^text-/u, /^davinci/u, /^babbage/u];

function readCloudModelSupport(provider: ProviderType, model: string | null): VisionSupport {
  if (provider !== 'anthropic' && provider !== 'openai') {
    return 'unknown';
  }

  if (!model) {
    return 'unknown';
  }

  return TEXT_ONLY_MODEL_PATTERNS.some((pattern) => pattern.test(model)) ? 'unsupported' : 'supported';
}

function matchesModel(entry: Record<string, unknown>, model: string | null): boolean {
  if (!model) {
    return true;
  }

  return [entry.key, entry.id].some((value) => typeof value === 'string' && value === model);
}

function readLmStudioModels(payload: unknown, model: string | null): VisionSupport {
  const models = asRecord(payload)?.models ?? asRecord(payload)?.data;

  if (!Array.isArray(models)) {
    return 'unknown';
  }

  const entries = models.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null);
  const entry = entries.find((candidate) => matchesModel(candidate, model));

  if (!entry) {
    return 'unknown';
  }

  const capabilities = asRecord(entry.capabilities);

  if (capabilities && typeof capabilities.vision === 'boolean') {
    return capabilities.vision ? 'supported' : 'unsupported';
  }

  if (typeof entry.type === 'string') {
    return entry.type === 'vlm' ? 'supported' : 'unsupported';
  }

  return 'unknown';
}

export class ProviderVisionProbe {
  private readonly cache = new Map<string, CachedSupport>();
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly now: () => number;

  constructor(dependencies: VisionProbeDependencies = {}) {
    this.fetchJson = dependencies.fetchJson ?? fetchJsonOverHttp;
    this.now = dependencies.now ?? (() => Date.now());
  }

  async getVisionSupport(target: VisionProbeTarget): Promise<VisionSupport> {
    const cacheKey = `${target.provider ?? ''}\u0000${target.baseUrl}\u0000${target.model ?? ''}`;
    const cached = this.cache.get(cacheKey);

    if (cached && this.now() < cached.expiresAtMs) {
      return cached.support;
    }

    const support = await this.detect(target);
    const ttl = support === 'unknown' ? UNKNOWN_TTL_MS : KNOWN_TTL_MS;
    this.cache.set(cacheKey, { expiresAtMs: this.now() + ttl, support });

    return support;
  }

  private async detect(target: VisionProbeTarget): Promise<VisionSupport> {
    if (target.provider) {
      const cloudSupport = readCloudModelSupport(target.provider, target.model);

      if (cloudSupport !== 'unknown') {
        return cloudSupport;
      }
    }

    let origin: string;

    try {
      origin = resolveProviderOrigin(target.baseUrl);
    } catch {
      return 'unknown';
    }

    const probes: (() => Promise<VisionSupport>)[] = [
      async () => readLlamaProps(await this.fetchJson(`${origin}/props`)),
      async () => readLmStudioModels(await this.fetchJson(`${origin}/api/v1/models`), target.model),
      async () => readLmStudioModels(await this.fetchJson(`${origin}/api/v0/models`), target.model),
    ];

    for (const probe of probes) {
      const support = await probe().catch((): VisionSupport => 'unknown');

      if (support !== 'unknown') {
        return support;
      }
    }

    return 'unknown';
  }
}

let sharedProbe: ProviderVisionProbe | null = null;

export function getProviderVisionProbe(): ProviderVisionProbe {
  if (!sharedProbe) {
    sharedProbe = new ProviderVisionProbe();
  }

  return sharedProbe;
}
