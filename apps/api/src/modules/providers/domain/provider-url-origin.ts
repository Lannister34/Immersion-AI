function readProviderUrlOrigin(value: string): string | null {
  const url = URL.parse(value.trim());

  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    return null;
  }

  return url.origin;
}

export function isSameProviderOrigin(left: string, right: string): boolean {
  const leftOrigin = readProviderUrlOrigin(left);

  return leftOrigin !== null && leftOrigin === readProviderUrlOrigin(right);
}
