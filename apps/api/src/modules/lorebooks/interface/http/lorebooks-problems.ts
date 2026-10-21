import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { LorebookNotFoundError } from '../../application/get-lorebook.js';

export const lorebooksProblems: ProblemTable = createProblemTable(
  problemFor(LorebookNotFoundError, () => problem(404, 'lorebook_not_found', 'Lorebook not found.')),
);
