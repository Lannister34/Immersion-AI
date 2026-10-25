import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { GenerationProviderUnavailableError } from '../../application/generation-provider.js';

export const providersProblems: ProblemTable = createProblemTable(
  problemFor(GenerationProviderUnavailableError, (error) =>
    problem(409, 'generation_provider_unavailable', error.message),
  ),
);
