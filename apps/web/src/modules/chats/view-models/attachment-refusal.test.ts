import {
  CHAT_MESSAGE_MAX_ATTACHMENTS,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_MEGABYTES,
} from '@immersion/contracts/common';
import { describe, expect, it } from 'vitest';

import { findAttachmentRefusal } from './attachment-refusal';

const PNG = { size: 4, type: 'image/png' };
const LIMIT_MESSAGE = `К одному сообщению можно приложить не больше ${CHAT_MESSAGE_MAX_ATTACHMENTS} изображений.`;

describe('findAttachmentRefusal', () => {
  it('accepts images that fit beside the attached ones', () => {
    expect(findAttachmentRefusal({ attachedCount: 3, files: [PNG, PNG], uploadingCount: 0 })).toBeNull();
  });

  it('counts uploads still in flight against the per-message limit', () => {
    const fill = CHAT_MESSAGE_MAX_ATTACHMENTS - 2;

    expect(findAttachmentRefusal({ attachedCount: 2, files: [PNG], uploadingCount: fill })).toBe(LIMIT_MESSAGE);
    expect(findAttachmentRefusal({ attachedCount: 1, files: [PNG], uploadingCount: fill })).toBeNull();
  });

  it('refuses a format the upload does not take', () => {
    expect(
      findAttachmentRefusal({ attachedCount: 0, files: [{ size: 4, type: 'image/gif' }], uploadingCount: 0 }),
    ).toBe('Поддерживаются только PNG, JPEG и WebP.');
  });

  it('refuses an image one byte over the upload limit and accepts one at it', () => {
    const atLimit = { size: IMAGE_UPLOAD_MAX_BYTES, type: 'image/webp' };
    const overLimit = { size: IMAGE_UPLOAD_MAX_BYTES + 1, type: 'image/webp' };

    expect(findAttachmentRefusal({ attachedCount: 0, files: [atLimit], uploadingCount: 0 })).toBeNull();
    expect(findAttachmentRefusal({ attachedCount: 0, files: [overLimit], uploadingCount: 0 })).toBe(
      `Изображение больше ${IMAGE_UPLOAD_MAX_MEGABYTES} МБ.`,
    );
  });
});
