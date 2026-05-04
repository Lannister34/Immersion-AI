import { ApiProblemSchema } from '@immersion/contracts/common';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface ApiRequestOptions {
  signal?: AbortSignal;
}

async function readJson(response: Response) {
  const text = await response.text();

  return text.length > 0 ? (JSON.parse(text) as unknown) : null;
}

async function parseResponse<T>(response: Response, schema: ZodType<T>) {
  const payload = await readJson(response);

  if (!response.ok) {
    const problem = ApiProblemSchema.safeParse(payload);

    throw new ApiError(
      problem.success ? problem.data.message : `HTTP ${response.status}`,
      response.status,
      problem.success ? problem.data.code : undefined,
    );
  }

  return schema.parse(payload);
}

export function createApiUrl(path: string) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  return apiBaseUrl ? new URL(path, apiBaseUrl).toString() : path;
}

export async function apiGet<T>(path: string, schema: ZodType<T>) {
  const response = await fetch(createApiUrl(path), {
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse(response, schema);
}

export async function apiPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
) {
  const payload = requestSchema.parse(body);
  const response = await fetch(createApiUrl(path), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response, responseSchema);
}

export async function apiPost<TRequest, TResponse>(
  path: string,
  body: TRequest,
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
  options: ApiRequestOptions = {},
) {
  const payload = requestSchema.parse(body);
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  };

  if (options.signal) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(createApiUrl(path), requestInit);

  return parseResponse(response, responseSchema);
}

export async function apiPatch<TRequest, TResponse>(
  path: string,
  body: TRequest,
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
) {
  const payload = requestSchema.parse(body);
  const response = await fetch(createApiUrl(path), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response, responseSchema);
}

export async function apiDelete<TResponse>(path: string, responseSchema: ZodType<TResponse>) {
  const response = await fetch(createApiUrl(path), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  });

  return parseResponse(response, responseSchema);
}
