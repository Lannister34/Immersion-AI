import { charactersProblems } from '../modules/characters/index.js';
import { lorebooksProblems } from '../modules/lorebooks/index.js';
import { scenariosProblems } from '../modules/scenarios/index.js';
import { platformProblems } from '../platform/http/platform-problems.js';
import { createProblemTable, type ProblemTable } from '../platform/http/problem-table.js';

export const apiProblems: ProblemTable = createProblemTable(
  platformProblems,
  charactersProblems,
  lorebooksProblems,
  scenariosProblems,
);
