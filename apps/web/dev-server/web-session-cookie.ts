const COOKIE_NAME = 'immersion_web_session';
const COOKIE_ATTRIBUTES = 'Path=/; HttpOnly; SameSite=Strict';

function cookiePairs(header: string | undefined): string[] {
  return (header ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);
}

function isSessionPair(pair: string): boolean {
  return pair.startsWith(`${COOKIE_NAME}=`);
}

export function readWebSessionToken(cookieHeader: string | undefined): string | null {
  const pair = cookiePairs(cookieHeader).find(isSessionPair);
  const token = pair?.slice(COOKIE_NAME.length + 1) ?? '';

  return token.length > 0 ? token : null;
}

export function withoutWebSessionCookie(cookieHeader: string | undefined): string | undefined {
  const others = cookiePairs(cookieHeader).filter((pair) => !isSessionPair(pair));

  return others.length > 0 ? others.join('; ') : undefined;
}

export function serializeWebSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; ${COOKIE_ATTRIBUTES}`;
}

export function serializeClearedWebSessionCookie(): string {
  return `${COOKIE_NAME}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
}
