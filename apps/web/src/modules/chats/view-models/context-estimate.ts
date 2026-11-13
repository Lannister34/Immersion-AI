import type { ContextStats } from './context-stats';

export type ContextEstimateStats = Pick<ContextStats, 'contextWindow' | 'tokenCountMethod' | 'totalTokens'>;

export function formatContextEstimate(stats: ContextEstimateStats): string {
  const prefix = stats.tokenCountMethod === 'approximate' ? '≈ ' : '';
  return `${prefix}${stats.totalTokens.toLocaleString('ru-RU')} / ${stats.contextWindow.toLocaleString('ru-RU')}`;
}
