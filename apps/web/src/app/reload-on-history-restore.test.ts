import { describe, expect, it, vi } from 'vitest';

import { reloadOnHistoryRestore } from './reload-on-history-restore';

function pageShow(persisted: boolean): Event {
  return Object.assign(new Event('pageshow'), { persisted });
}

describe('reloadOnHistoryRestore', () => {
  it('reloads a page the browser restored from its back-forward cache, so the server sees the page load', () => {
    const target = new EventTarget() as unknown as Window;
    const reload = vi.fn();

    reloadOnHistoryRestore(target, reload);
    target.dispatchEvent(pageShow(false));
    expect(reload).not.toHaveBeenCalled();

    target.dispatchEvent(pageShow(true));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stops listening when disposed', () => {
    const target = new EventTarget() as unknown as Window;
    const reload = vi.fn();

    reloadOnHistoryRestore(target, reload)();
    target.dispatchEvent(pageShow(true));

    expect(reload).not.toHaveBeenCalled();
  });
});
