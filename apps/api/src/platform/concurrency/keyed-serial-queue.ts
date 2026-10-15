import { createSerialQueue, type SerialQueue } from './serial-queue.js';

export interface KeyedSerialQueue<K> {
  readonly activeKeyCount: number;
  run<T>(key: K, operation: () => Promise<T>): Promise<T>;
}

interface KeyLane {
  readonly queue: SerialQueue;
  pending: number;
}

export function createKeyedSerialQueue<K>(): KeyedSerialQueue<K> {
  const lanes = new Map<K, KeyLane>();

  return {
    get activeKeyCount() {
      return lanes.size;
    },

    async run<T>(key: K, operation: () => Promise<T>): Promise<T> {
      const lane = lanes.get(key) ?? { queue: createSerialQueue(), pending: 0 };
      lanes.set(key, lane);
      lane.pending += 1;

      try {
        return await lane.queue.run(operation);
      } finally {
        lane.pending -= 1;
        if (lane.pending === 0) {
          lanes.delete(key);
        }
      }
    },
  };
}
