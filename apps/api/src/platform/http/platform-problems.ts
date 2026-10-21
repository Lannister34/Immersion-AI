import { errorCodes } from 'fastify';

import { UnsafeRepositoryFileIdError } from '../storage/contained-path.js';
import { RequestValidationError } from './parse-request.js';
import { problem } from './problem.js';
import { createProblemTable, type ProblemTable, problemFor } from './problem-table.js';

export const platformProblems: ProblemTable = createProblemTable(
  problemFor(RequestValidationError, (error) => problem(400, 'validation_error', error.message)),
  problemFor(UnsafeRepositoryFileIdError, () => problem(400, 'validation_error', 'Invalid resource identifier.')),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_JSON_BODY, () =>
    problem(400, 'invalid_request', 'Тело запроса не является корректным JSON.'),
  ),
  problemFor(errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY, () =>
    problem(400, 'invalid_request', 'Тело запроса с типом JSON пустое.'),
  ),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_CONTENT_LENGTH, () =>
    problem(400, 'invalid_request', 'Размер тела запроса не совпадает с заголовком Content-Length.'),
  ),
  problemFor(errorCodes.FST_ERR_CTP_BODY_TOO_LARGE, () =>
    problem(413, 'payload_too_large', 'Тело запроса слишком большое.'),
  ),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE, () =>
    problem(415, 'unsupported_media_type', 'Тип содержимого запроса не поддерживается.'),
  ),
);
