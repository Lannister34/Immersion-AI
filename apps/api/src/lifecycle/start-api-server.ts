import type { LogPort } from '../platform/logging/log-port.js';

export interface ApiListenAddress {
  readonly host: string;
  readonly port: number;
}

export interface ListenableApi {
  listen(address: ApiListenAddress): Promise<unknown>;
  close(): Promise<unknown>;
  readonly log: LogPort;
}

export async function startApiServer(app: ListenableApi, { host, port }: ApiListenAddress): Promise<void> {
  try {
    await app.listen({ host, port });
  } catch (listenError) {
    app.log.error({ err: listenError, host, port }, 'API failed to listen');
    await app.close().catch((closeError: unknown) => {
      app.log.error({ err: closeError }, 'API failed to close after a failed listen');
    });

    throw listenError;
  }
}
