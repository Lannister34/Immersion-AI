import { describe, expect, it } from 'vitest';

import { NON_IMAGE_FILES_SKIPPED, planImageDrop } from './image-drop';

const UNAVAILABLE = 'Загруженная модель работает только с текстом.';

function file(name: string, type: string): File {
  return new File(['x'], name, { type });
}

describe('planImageDrop', () => {
  it('attaches every dropped image and says nothing', () => {
    const files = [file('маяк.png', 'image/png'), file('шхуна.webp', 'image/webp')];

    expect(planImageDrop({ canAttachImages: true, files, unavailableReason: UNAVAILABLE })).toEqual({
      images: files,
      notice: null,
    });
  });

  it('attaches the images and says the other dropped files were skipped', () => {
    const image = file('маяк.jpg', 'image/jpeg');

    expect(
      planImageDrop({
        canAttachImages: true,
        files: [file('лоция.pdf', 'application/pdf'), image, file('заметки', '')],
        unavailableReason: UNAVAILABLE,
      }),
    ).toEqual({ images: [image], notice: NON_IMAGE_FILES_SKIPPED });
  });

  it('says the files were skipped when nothing dropped is an image', () => {
    expect(
      planImageDrop({
        canAttachImages: true,
        files: [file('лоция.txt', 'text/plain')],
        unavailableReason: UNAVAILABLE,
      }),
    ).toEqual({ images: [], notice: NON_IMAGE_FILES_SKIPPED });
  });

  it('hands an image type the upload refuses to the attach path, which reports the format', () => {
    const gif = file('волна.gif', 'image/gif');

    expect(planImageDrop({ canAttachImages: true, files: [gif], unavailableReason: UNAVAILABLE })).toEqual({
      images: [gif],
      notice: null,
    });
  });

  it('attaches nothing and gives the reason when images cannot be attached now', () => {
    expect(
      planImageDrop({
        canAttachImages: false,
        files: [file('маяк.png', 'image/png'), file('лоция.pdf', 'application/pdf')],
        unavailableReason: UNAVAILABLE,
      }),
    ).toEqual({ images: [], notice: UNAVAILABLE });
  });
});
