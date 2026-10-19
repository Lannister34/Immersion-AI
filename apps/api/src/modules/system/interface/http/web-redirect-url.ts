export function resolveWebRedirectUrl(requestHost: string | undefined, webPort: number): string {
  const fallbackUrl = `http://127.0.0.1:${webPort}/chat`;

  if (!requestHost) {
    return fallbackUrl;
  }

  try {
    const url = new URL(`http://${requestHost}`);

    url.port = String(webPort);
    url.pathname = '/chat';
    url.search = '';
    url.hash = '';

    return url.toString();
  } catch {
    return fallbackUrl;
  }
}
