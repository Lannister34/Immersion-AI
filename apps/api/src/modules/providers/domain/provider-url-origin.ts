export function readProviderUrlOrigin(value: string): string | null {
  const url = URL.parse(value.trim());

  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null;
  }

  return url.origin;
}
