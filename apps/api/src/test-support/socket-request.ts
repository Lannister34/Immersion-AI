import http from 'node:http';

export interface SocketResponse {
  readonly status: number | undefined;
  readonly body: string;
}

export interface SocketRequestOptions {
  readonly method?: string;
  readonly json?: unknown;
}

export function requestOverSocket(
  url: string,
  { method = 'GET', json }: SocketRequestOptions = {},
): Promise<SocketResponse> {
  return new Promise<SocketResponse>((resolve, reject) => {
    const headers: Record<string, string> = json === undefined ? {} : { 'Content-Type': 'application/json' };
    const request = http.request(url, { agent: false, headers, method }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(json === undefined ? undefined : JSON.stringify(json));
  });
}
