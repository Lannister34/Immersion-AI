export function base64LengthFor(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}
