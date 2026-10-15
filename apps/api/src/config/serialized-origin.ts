export function serializedOrigin(entry: string): string {
  return new URL(entry).origin;
}
