export interface SerialQueue {
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();

  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(() => operation());
      tail = result.then(
        () => undefined,
        () => undefined,
      );

      return await result;
    },
  };
}
