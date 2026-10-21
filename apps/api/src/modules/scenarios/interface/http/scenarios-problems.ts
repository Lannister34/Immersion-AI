import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { ScenarioNotFoundError } from '../../application/get-scenario.js';

export const scenariosProblems: ProblemTable = createProblemTable(
  problemFor(ScenarioNotFoundError, () => problem(404, 'scenario_not_found', 'Scenario not found.')),
);
