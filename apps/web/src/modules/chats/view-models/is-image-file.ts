export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}
