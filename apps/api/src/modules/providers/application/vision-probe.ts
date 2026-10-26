import type { VisionSupport } from '@immersion/contracts/generation';
import type { ProviderType } from '@immersion/contracts/providers';

export interface VisionProbeTarget {
  baseUrl: string;
  model: string | null;
  provider?: ProviderType | null;
}

export interface VisionProbe {
  getVisionSupport(target: VisionProbeTarget): Promise<VisionSupport>;
}
