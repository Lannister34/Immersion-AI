export function causeOf(error) {
  return error instanceof Error ? error.message : String(error);
}
