import { describe, expect, it } from 'vitest';

import { base64LengthFor } from '../common/base64-length.js';
import { IMAGE_UPLOAD_MAX_BYTES } from '../common/upload-limits.js';
import { UploadCharacterAvatarCommandSchema } from './index.js';

describe('UploadCharacterAvatarCommandSchema', () => {
  it('accepts base64 as long as the image upload limit encodes to, and refuses one block more', () => {
    const capLength = base64LengthFor(IMAGE_UPLOAD_MAX_BYTES);

    expect(
      UploadCharacterAvatarCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength), mimeType: 'image/png' })
        .success,
    ).toBe(true);
    expect(
      UploadCharacterAvatarCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength + 4), mimeType: 'image/png' })
        .success,
    ).toBe(false);
  });
});
