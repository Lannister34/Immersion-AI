const BASE = new URL('http://return-path.invalid');
const GATE_PATH_PREFIX = '/__web/';

export function toSafeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith('/')) return '/';

  let url: URL;

  try {
    url = new URL(value, BASE);
  } catch {
    return '/';
  }

  if (url.origin !== BASE.origin || url.pathname.startsWith(GATE_PATH_PREFIX)) return '/';

  return `${url.pathname}${url.search}`;
}
