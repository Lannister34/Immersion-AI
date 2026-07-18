export type TokenCountMethod = 'approximate' | 'exact';

export interface TokenCountResult {
  counts: number[];
  method: TokenCountMethod;
}

/**
 * Port for counting prompt tokens. Implementations must never throw:
 * when an exact backend is unavailable they fall back to the heuristic
 * and report method 'approximate'.
 */
export interface TokenCounter {
  countTokens(texts: string[]): Promise<TokenCountResult>;
}

/**
 * Historic chars/4 estimate. This exact formula is the contract for the
 * no-provider path: budgeting without an exact counter must not change.
 */
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
