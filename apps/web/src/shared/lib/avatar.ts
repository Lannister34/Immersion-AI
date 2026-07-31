export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `oklch(0.45 0.1 ${hue})`;
}

export function avatarInitial(value: string | null | undefined): string {
  if (!value) {
    return '?';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '?';
  }
  const words = trimmed.split(/\s+/u);
  if (words.length > 1 && words[1] && words[1].length > 0) {
    return `${words[0]?.charAt(0) ?? ''}${words[1].charAt(0)}`.toUpperCase();
  }
  return trimmed.charAt(0).toUpperCase();
}
