import { describe, expect, it } from 'vitest';

import { isImageFile } from './is-image-file';

describe('isImageFile', () => {
  it('takes any image type, leaving the format check to the upload', () => {
    expect(isImageFile(new File(['x'], 'маяк.png', { type: 'image/png' }))).toBe(true);
    expect(isImageFile(new File(['x'], 'волна.gif', { type: 'image/gif' }))).toBe(true);
  });

  it('refuses other files and files the browser could not type', () => {
    expect(isImageFile(new File(['x'], 'лоция.pdf', { type: 'application/pdf' }))).toBe(false);
    expect(isImageFile(new File(['x'], 'заметки', { type: '' }))).toBe(false);
  });
});
