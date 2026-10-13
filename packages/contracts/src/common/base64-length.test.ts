import { describe, expect, it } from 'vitest';

import { base64LengthFor } from './base64-length.js';
import { CHAT_IMPORT_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES } from './upload-limits.js';

describe('base64LengthFor', () => {
  it.each([
    0,
    1,
    2,
    3,
    4,
    5,
    IMAGE_UPLOAD_MAX_BYTES,
    IMAGE_UPLOAD_MAX_BYTES + 1,
    CHAT_IMPORT_MAX_BYTES,
  ])('matches the padded length Node encodes for %i bytes', (byteLength) => {
    expect(base64LengthFor(byteLength)).toBe(Buffer.alloc(byteLength).toString('base64').length);
  });
});
