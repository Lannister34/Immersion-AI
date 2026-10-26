import http from 'node:http';

export interface OpenSocketRequest {
  disconnect(): Promise<void>;
}

export function openSocketRequest(url: string, json: unknown): OpenSocketRequest {
  let disconnecting = false;
  const request = http.request(url, {
    agent: false,
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const closed = new Promise<void>((resolve) => {
    request.once('close', () => resolve());
  });

  request.on('error', (error) => {
    if (!disconnecting) {
      throw error;
    }
  });
  request.end(JSON.stringify(json));

  return {
    async disconnect() {
      disconnecting = true;
      request.destroy();
      await closed;
    },
  };
}
