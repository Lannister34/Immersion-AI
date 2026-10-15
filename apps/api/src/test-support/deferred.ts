export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

export function createDeferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}
