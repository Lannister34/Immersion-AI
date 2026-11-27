type ChangeListener = (event: MediaQueryListEvent) => void;

interface MediaQueryStub {
  install: (target: Window) => void;
  matchOnly: (queries: readonly string[]) => void;
}

function createMediaQueryStub(): MediaQueryStub {
  let matching = new Set<string>();
  const listeners = new Map<string, Set<ChangeListener>>();

  const listenersOf = (query: string): Set<ChangeListener> => {
    const existing = listeners.get(query);
    if (existing) return existing;
    const created = new Set<ChangeListener>();
    listeners.set(query, created);
    return created;
  };

  const matchMedia = (query: string): MediaQueryList =>
    ({
      addEventListener: (_type: string, listener: ChangeListener) => listenersOf(query).add(listener),
      get matches() {
        return matching.has(query);
      },
      media: query,
      removeEventListener: (_type: string, listener: ChangeListener) => listenersOf(query).delete(listener),
    }) as unknown as MediaQueryList;

  return {
    install: (target) => {
      target.matchMedia = matchMedia;
    },
    matchOnly: (queries) => {
      const previous = matching;
      matching = new Set(queries);
      for (const [query, queryListeners] of listeners) {
        if (previous.has(query) === matching.has(query)) continue;
        for (const listener of queryListeners) {
          listener({ matches: matching.has(query), media: query } as MediaQueryListEvent);
        }
      }
    },
  };
}

export const mediaQueryStub: MediaQueryStub = createMediaQueryStub();
