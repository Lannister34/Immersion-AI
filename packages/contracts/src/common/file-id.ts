import { z } from 'zod';

const NULL_CHARACTER = String.fromCharCode(0);

// File-backed resource ids double as file names inside a single storage directory.
// Reject path separators, traversal sequences, null bytes, Windows drive colons,
// and hidden-file prefixes while keeping existing human-readable names
// (Unicode letters, spaces, single dots) valid.
const FORBIDDEN_FILE_ID_SEQUENCES = ['\\', '/', ':', '..', NULL_CHARACTER] as const;

export function createFileIdSchema(label: string) {
  return z
    .string()
    .min(1)
    .max(200)
    .refine(
      (value) => !value.startsWith('.') && FORBIDDEN_FILE_ID_SEQUENCES.every((sequence) => !value.includes(sequence)),
      {
        message: `${label} must be a plain file name without path separators.`,
      },
    );
}
