export function serializedOrigins(entries: readonly string[]): readonly string[] {
  return [...new Set(entries.map((entry) => new URL(entry).origin))];
}
