import { describe, expect, it } from 'vitest';

import { base64LengthFor } from '../common/base64-length.js';
import { CHAT_IMPORT_MAX_BYTES, IMAGE_UPLOAD_MAX_BYTES } from '../common/upload-limits.js';
import { ImportChatCommandSchema, UploadChatAttachmentCommandSchema } from './index.js';

describe('chat upload caps', () => {
  it('accepts an attachment as long as the image upload limit encodes to, and refuses one block more', () => {
    const capLength = base64LengthFor(IMAGE_UPLOAD_MAX_BYTES);

    expect(
      UploadChatAttachmentCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength), mimeType: 'image/png' })
        .success,
    ).toBe(true);
    expect(
      UploadChatAttachmentCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength + 4), mimeType: 'image/png' })
        .success,
    ).toBe(false);
  });

  it('accepts an import as long as the chat import limit encodes to, and refuses one block more', () => {
    const capLength = base64LengthFor(CHAT_IMPORT_MAX_BYTES);

    expect(ImportChatCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength) }).success).toBe(true);
    expect(ImportChatCommandSchema.safeParse({ contentBase64: 'A'.repeat(capLength + 4) }).success).toBe(false);
  });
});
