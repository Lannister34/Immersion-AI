import { describe, expect, it } from 'vitest';

import { deriveComposerActions } from './composer-actions';

const IDLE = {
  attachmentCount: 0,
  blockReason: undefined,
  hasActiveJob: false,
  isEditingMessage: false,
  isGeneratingFirstMessage: false,
  isReplyStarting: false,
  isUploadingAttachment: false,
  text: 'Привет, Мария!',
};

describe('deriveComposerActions', () => {
  it('sends text, with or without images', () => {
    expect(deriveComposerActions(IDLE)).toEqual({ canSend: true, hint: null });
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 4 })).toEqual({ canSend: true, hint: null });
  });

  it('refuses to send images without text', () => {
    for (const text of ['', '  \n\t ']) {
      expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, text })).toEqual({
        canSend: false,
        hint: 'Добавьте текст к изображению',
      });
    }
  });

  it('refuses to send an empty draft without a hint', () => {
    expect(deriveComposerActions({ ...IDLE, text: ' \n ' })).toEqual({ canSend: false, hint: null });
  });

  it('blocks send while an image is still uploading', () => {
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, isUploadingAttachment: true }).canSend).toBe(false);
    expect(deriveComposerActions({ ...IDLE, isUploadingAttachment: true }).canSend).toBe(false);
  });

  it.each([
    ['a reply job is being started', { isReplyStarting: true }],
    ['a reply job runs', { hasActiveJob: true }],
    ['the first message is generated', { isGeneratingFirstMessage: true }],
    ['a message is edited', { isEditingMessage: true }],
    ['the model is not ready', { blockReason: 'Модель не готова.' }],
  ])('blocks send while %s', (_name, state) => {
    expect(deriveComposerActions({ ...IDLE, ...state }).canSend).toBe(false);
  });
});
