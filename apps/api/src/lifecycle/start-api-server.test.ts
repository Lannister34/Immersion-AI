import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCapturingLogger } from '../test-support/capturing-logger.js';
import { type ListenableApi, startApiServer } from './start-api-server.js';

describe('startApiServer', () => {
  const apps: Pick<ListenableApi, 'close'>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  function track<App extends Pick<ListenableApi, 'close'>>(app: App): App {
    apps.push(app);

    return app;
  }

  it('listens on the given address', async () => {
    const app = track(Fastify());

    await startApiServer(app, { host: '127.0.0.1', port: 0 });

    expect(app.server.listening).toBe(true);
  });

  it('closes the app and rejects when the port is taken, so nothing chained after the listen runs', async () => {
    const holder = track(Fastify());
    const takenPort = Number(new URL(await holder.listen({ host: '127.0.0.1', port: 0 })).port);
    const { logger, lines } = createCapturingLogger();
    const app = track(Fastify({ loggerInstance: logger }));
    const onClose = vi.fn<() => Promise<void>>(async () => undefined);
    const afterListen = vi.fn<() => void>();

    app.addHook('onClose', onClose);

    await expect(startApiServer(app, { host: '127.0.0.1', port: takenPort }).then(afterListen)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(afterListen).not.toHaveBeenCalled();
    expect(lines).toContainEqual(
      expect.objectContaining({ host: '127.0.0.1', level: 'error', msg: 'API failed to listen', port: takenPort }),
    );
  });

  it('rejects with the listen error, not the close error, when closing fails as well', async () => {
    const { logger, lines } = createCapturingLogger();
    const listenError = Object.assign(new Error('listen EACCES: permission denied 127.0.0.1:80'), { code: 'EACCES' });
    const app: ListenableApi = {
      close: vi.fn<ListenableApi['close']>(async () => {
        throw new Error('onClose hook failed');
      }),
      listen: vi.fn<ListenableApi['listen']>(async () => {
        throw listenError;
      }),
      log: logger,
    };

    await expect(startApiServer(app, { host: '127.0.0.1', port: 80 })).rejects.toBe(listenError);
    expect(app.close).toHaveBeenCalledOnce();
    expect(lines.map(({ level, msg }) => ({ level, msg }))).toEqual([
      { level: 'error', msg: 'API failed to listen' },
      { level: 'error', msg: 'API failed to close after a failed listen' },
    ]);
  });
});
