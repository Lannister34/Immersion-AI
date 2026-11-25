import { describe, expect, it } from 'vitest';

import { deriveComposerActions, IMAGES_NEED_VISION_MODEL } from './composer-actions';

const IDLE = {
  attachmentCount: 0,
  blockReason: undefined,
  hasActiveJob: false,
  isEditingMessage: false,
  isGeneratingFirstMessage: false,
  isReplyStarting: false,
  isSendingMessage: false,
  isUploadingAttachment: false,
  modelAcceptsImages: true,
  text: 'Привет, Мария!',
};

describe('deriveComposerActions', () => {
  it('sends text, with or without images', () => {
    expect(deriveComposerActions(IDLE)).toMatchObject({ canSend: true });
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 4 })).toMatchObject({ canSend: true });
  });

  it('sends images without text', () => {
    for (const text of ['', '  \n\t ']) {
      expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, text })).toMatchObject({ canSend: true });
    }
  });

  it('refuses to send a draft with neither text nor images', () => {
    for (const text of ['', ' \n ']) {
      expect(deriveComposerActions({ ...IDLE, text })).toMatchObject({ canSend: false });
    }
  });

  it('blocks send while an image is still uploading', () => {
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, isUploadingAttachment: true }).canSend).toBe(false);
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, isUploadingAttachment: true, text: '' }).canSend).toBe(
      false,
    );
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
    expect(deriveComposerActions({ ...IDLE, ...state, attachmentCount: 1, text: '' }).canSend).toBe(false);
  });

  it('opens attaching unless the loaded model is known to take only text', () => {
    expect(deriveComposerActions(IDLE).canAttachImages).toBe(true);
    expect(deriveComposerActions({ ...IDLE, modelAcceptsImages: false }).canAttachImages).toBe(false);
  });

  it('opens attaching while no model is ready, though sending waits for one', () => {
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 1, blockReason: 'Модель не готова.' })).toEqual({
      canAttachImages: true,
      canSend: false,
      sendRefusal: null,
    });
  });

  it('refuses to send images to a text-only model and says how to go on', () => {
    expect(deriveComposerActions({ ...IDLE, attachmentCount: 2, modelAcceptsImages: false })).toEqual({
      canAttachImages: false,
      canSend: false,
      sendRefusal: IMAGES_NEED_VISION_MODEL,
    });
    expect(deriveComposerActions({ ...IDLE, modelAcceptsImages: false })).toMatchObject({
      canSend: true,
      sendRefusal: null,
    });
  });

  it('closes attaching while a message is being sent, so a failed send can put its own images back', () => {
    expect(deriveComposerActions({ ...IDLE, isReplyStarting: true, isSendingMessage: true }).canAttachImages).toBe(
      false,
    );
  });

  it('keeps attaching open while a reply streams, so the next message can be prepared', () => {
    expect(deriveComposerActions({ ...IDLE, hasActiveJob: true, isReplyStarting: true }).canAttachImages).toBe(true);
  });
});
