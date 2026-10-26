import type { ServerResponse } from 'node:http';

export function clientDisconnectSignal(response: ServerResponse): AbortSignal {
  const controller = new AbortController();
  const abortUnlessEnded = () => {
    if (!response.writableEnded) {
      controller.abort(new DOMException('The client closed the connection before the response ended.', 'AbortError'));
    }
  };

  if (response.destroyed) {
    abortUnlessEnded();
  } else {
    response.once('close', abortUnlessEnded);
  }

  return controller.signal;
}
