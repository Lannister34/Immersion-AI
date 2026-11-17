export interface WebLoginThrottleOptions {
  readonly now: () => number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly forgetAfterMs: number;
  readonly maxAddresses: number;
  readonly globalFailureLimit: number;
  readonly globalWindowMs: number;
}

interface FailureRecord {
  failures: number;
  blockedUntil: number;
}

const OVERFLOW_KEY = '*';

export class WebLoginThrottle {
  private readonly records = new Map<string, FailureRecord>();
  private readonly recentFailures: number[] = [];
  private readonly options: WebLoginThrottleOptions;

  constructor(options: WebLoginThrottleOptions) {
    this.options = options;
  }

  retryAfterMs(address: string): number {
    const now = this.options.now();
    const record = this.records.get(this.keyFor(address, now));
    const addressWait = record ? Math.max(0, record.blockedUntil - now) : 0;

    return Math.max(addressWait, this.globalWaitMs(now));
  }

  recordFailure(address: string): number {
    const now = this.options.now();
    const key = this.keyFor(address, now);
    const previous = this.records.get(key);
    const failures = previous && now - previous.blockedUntil < this.options.forgetAfterMs ? previous.failures + 1 : 1;
    const delayMs = Math.min(this.options.baseDelayMs * 2 ** (failures - 1), this.options.maxDelayMs);

    this.records.set(key, { failures, blockedUntil: now + delayMs });
    this.recentFailures.push(now);
    if (this.recentFailures.length > this.options.globalFailureLimit) this.recentFailures.shift();

    return Math.max(delayMs, this.globalWaitMs(now));
  }

  recordSuccess(address: string): void {
    if (address !== OVERFLOW_KEY) this.records.delete(address);
  }

  private keyFor(address: string, now: number): string {
    if (this.records.has(address) || this.records.size < this.options.maxAddresses) return address;

    for (const [key, record] of this.records) {
      if (now - record.blockedUntil >= this.options.forgetAfterMs) this.records.delete(key);
    }

    return this.records.size < this.options.maxAddresses ? address : OVERFLOW_KEY;
  }

  private globalWaitMs(now: number): number {
    while (this.recentFailures.length > 0 && now - (this.recentFailures[0] ?? now) >= this.options.globalWindowMs) {
      this.recentFailures.shift();
    }

    if (this.recentFailures.length < this.options.globalFailureLimit) return 0;

    return (this.recentFailures[0] ?? now) + this.options.globalWindowMs - now;
  }
}
