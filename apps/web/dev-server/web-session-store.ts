import { randomBytes } from 'node:crypto';

export interface WebSessionStoreOptions {
  readonly now: () => number;
  readonly ttlMs: number;
  readonly maxSessions: number;
}

interface WebSession {
  readonly expiresAt: number;
  documentLoadsLeft: number;
}

export class WebSessionStore {
  private readonly sessions = new Map<string, WebSession>();
  private readonly options: WebSessionStoreOptions;

  constructor(options: WebSessionStoreOptions) {
    this.options = options;
  }

  create(): string {
    this.dropExpired();

    for (const oldest of this.sessions.keys()) {
      if (this.sessions.size < this.options.maxSessions) break;
      this.sessions.delete(oldest);
    }

    const token = randomBytes(32).toString('base64url');
    this.sessions.set(token, { documentLoadsLeft: 1, expiresAt: this.options.now() + this.options.ttlMs });

    return token;
  }

  isValid(token: string | null): boolean {
    return this.find(token) !== null;
  }

  admitDocumentLoad(token: string | null): boolean {
    const session = this.find(token);

    if (session === null || session.documentLoadsLeft === 0) {
      this.revoke(token);
      return false;
    }

    session.documentLoadsLeft -= 1;
    return true;
  }

  revoke(token: string | null): void {
    if (token !== null) this.sessions.delete(token);
  }

  private find(token: string | null): WebSession | null {
    if (token === null) return null;

    const session = this.sessions.get(token);

    if (session === undefined) return null;
    if (session.expiresAt <= this.options.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  private dropExpired(): void {
    const now = this.options.now();

    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }
}
