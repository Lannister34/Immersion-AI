import type { Problem } from '../../../../platform/http/problem.js';

type OpenAiErrorType = 'invalid_request_error' | 'server_error' | 'upstream_error';

export interface OpenAiErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly type: OpenAiErrorType;
  };
}

const SERVER_FAULT_STATUS = 500;
const BAD_GATEWAY_STATUS = 502;

function openAiErrorTypeOf(statusCode: number): OpenAiErrorType {
  if (statusCode < SERVER_FAULT_STATUS) {
    return 'invalid_request_error';
  }

  return statusCode === BAD_GATEWAY_STATUS ? 'upstream_error' : 'server_error';
}

export function toOpenAiErrorEnvelope(answer: Problem): OpenAiErrorEnvelope {
  return {
    error: { code: answer.body.code, message: answer.body.message, type: openAiErrorTypeOf(answer.statusCode) },
  };
}
