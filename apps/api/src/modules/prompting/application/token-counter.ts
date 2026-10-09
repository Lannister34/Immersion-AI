export type TokenCountMethod = 'approximate' | 'exact';

export interface TokenCountResult {
  counts: number[];
  method: TokenCountMethod;
}

export interface TokenCounter {
  countTokens(texts: string[]): Promise<TokenCountResult>;
}

export function estimateTokensHeuristic(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function countTokensHeuristic(texts: string[]): TokenCountResult {
  return {
    counts: texts.map((text) => estimateTokensHeuristic(text)),
    method: 'approximate',
  };
}

export const heuristicTokenCounter: TokenCounter = {
  countTokens: (texts) => Promise.resolve(countTokensHeuristic(texts)),
};
