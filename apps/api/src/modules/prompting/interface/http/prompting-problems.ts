import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { InvalidChatGenerationSettingsResolutionError } from '../../application/resolve-chat-generation-settings.js';

export const promptingProblems: ProblemTable = createProblemTable(
  problemFor(InvalidChatGenerationSettingsResolutionError, (error) =>
    problem(409, 'invalid_chat_generation_settings', error.message),
  ),
);
