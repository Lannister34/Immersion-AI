import type { UserSettingsDocument, UserSettingsRecord } from '../modules/settings/index.js';

export interface InMemoryUserSettings extends UserSettingsDocument {
  readonly writes: readonly UserSettingsRecord[];
}

export function createInMemoryUserSettings(initial: UserSettingsRecord = {}): InMemoryUserSettings {
  let current = structuredClone(initial);
  let tail: Promise<unknown> = Promise.resolve();
  const writes: UserSettingsRecord[] = [];

  return {
    writes,
    read() {
      return structuredClone(current);
    },
    update(mutate) {
      const next = tail.then(async () => {
        const updated = await mutate(structuredClone(current));
        current = structuredClone(updated);
        writes.push(structuredClone(updated));

        return structuredClone(updated);
      });
      tail = next.catch(() => undefined);

      return next;
    },
  };
}
