import {
  ActiveGenerationJobProblemSchema,
  ChatReplyGenerationErrorResponseSchema,
} from '@immersion/contracts/generation';

import { contractProblem, problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import {
  ChatNotEmptyError,
  ChatReplyGenerationFailedError,
  ChatTranscriptEmptyError,
  GenerationJobNotFoundError,
  NoAssistantMessageToRegenerateError,
  NothingToAnswerError,
  NothingToContinueError,
  ProviderGenerationError,
} from '../../application/generation-errors.js';
import { ActiveGenerationJobExistsError } from '../../application/generation-job-registry.js';

export const generationProblems: ProblemTable = createProblemTable(
  problemFor(NoAssistantMessageToRegenerateError, () =>
    problem(
      409,
      'no_assistant_message_to_regenerate',
      'Перегенерировать нечего: чат не заканчивается ответом персонажа на сообщение пользователя.',
    ),
  ),
  problemFor(NothingToAnswerError, () =>
    problem(
      409,
      'nothing_to_answer',
      'Отвечать не на что: последним в чате должно быть непустое сообщение пользователя.',
    ),
  ),
  problemFor(NothingToContinueError, () =>
    problem(
      409,
      'nothing_to_continue',
      'Продолжать нечего: последнее сообщение в чате должно быть непустым ответом персонажа.',
    ),
  ),
  problemFor(ChatTranscriptEmptyError, (error) => problem(409, 'chat_empty', error.message)),
  problemFor(ChatNotEmptyError, (error) => problem(409, 'chat_not_empty', error.message)),
  problemFor(ActiveGenerationJobExistsError, (error) =>
    contractProblem(409, ActiveGenerationJobProblemSchema, {
      code: 'active_generation_job_exists',
      message: 'An active generation job already exists for this chat.',
      job: error.job,
    }),
  ),
  problemFor(ChatReplyGenerationFailedError, (error) =>
    contractProblem(error.statusCode, ChatReplyGenerationErrorResponseSchema, {
      code: error.code,
      message: error.message,
      session: error.session,
    }),
  ),
  problemFor(ProviderGenerationError, (error) => problem(502, 'provider_generation_failed', error.message)),
  problemFor(GenerationJobNotFoundError, () => problem(404, 'generation_job_not_found', 'Generation job not found.')),
);
