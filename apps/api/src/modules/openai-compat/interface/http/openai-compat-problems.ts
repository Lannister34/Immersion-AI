import { errorCodes } from 'fastify';

import { RequestValidationError } from '../../../../platform/http/parse-request.js';
import { type Problem, problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { ProviderGenerationError } from '../../../generation/index.js';
import { GenerationProviderUnavailableError } from '../../../providers/index.js';
import { UnsupportedOpenAiFeatureError } from '../../domain/unsupported-openai-feature-error.js';

const UNEXPECTED_MESSAGE = 'Unexpected error.';
const INVALID_REQUEST_MESSAGE = 'The request body cannot be read.';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback;
}

function invalidRequest(error: Error): Problem {
  return problem(400, 'invalid_request', messageOf(error, INVALID_REQUEST_MESSAGE));
}

function joinIssues(error: RequestValidationError): string {
  const joined = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

  return joined === '' ? INVALID_REQUEST_MESSAGE : joined;
}

export const openAiCompatProblems: ProblemTable = createProblemTable(
  problemFor(UnsupportedOpenAiFeatureError, (error) =>
    problem(400, 'unsupported_feature', messageOf(error, 'This feature is not supported by this endpoint.')),
  ),
  problemFor(RequestValidationError, (error) => problem(400, 'invalid_request', joinIssues(error))),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_JSON_BODY, invalidRequest),
  problemFor(errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY, invalidRequest),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_CONTENT_LENGTH, invalidRequest),
  problemFor(errorCodes.FST_ERR_CTP_BODY_TOO_LARGE, (error) =>
    problem(413, 'request_too_large', messageOf(error, 'The request body is too large.')),
  ),
  problemFor(errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE, (error) =>
    problem(415, 'unsupported_media_type', messageOf(error, 'The request content type is not supported.')),
  ),
  problemFor(GenerationProviderUnavailableError, (error) =>
    problem(503, 'provider_unavailable', messageOf(error, 'The provider is unavailable.')),
  ),
  problemFor(ProviderGenerationError, (error) =>
    problem(502, 'provider_failed', messageOf(error, 'The provider failed to generate a reply.')),
  ),
);

export function toUnexpectedOpenAiProblem(error: unknown): Problem {
  return problem(500, 'internal_error', messageOf(error, UNEXPECTED_MESSAGE));
}
