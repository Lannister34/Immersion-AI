export function findFirstImageFile(files: ArrayLike<File>): File | null {
  return Array.from(files).find((file) => file.type.startsWith('image/')) ?? null;
}
