import { z } from 'zod';

import { isPlainFileName } from './plain-file-name.js';

export function createFileIdSchema(label: string): z.ZodString {
  return z.string().refine(isPlainFileName, {
    message: `${label} must be a plain file name without path separators.`,
  });
}
