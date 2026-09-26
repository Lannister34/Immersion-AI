import { describe, expect, it } from 'vitest';

import { findFirstImageFile } from './clipboard-image';

function fileOf(name: string, type: string): File {
  return new File(['content'], name, { type });
}

describe('findFirstImageFile', () => {
  it('takes the first image among the pasted files and skips the rest', () => {
    const png = fileOf('avatar.png', 'image/png');
    const jpeg = fileOf('other.jpg', 'image/jpeg');

    expect(findFirstImageFile([fileOf('notes.txt', 'text/plain'), png, jpeg])).toBe(png);
  });

  it('takes an image of an unsupported format too, so the upload can explain what is accepted', () => {
    const gif = fileOf('funny.gif', 'image/gif');

    expect(findFirstImageFile([gif])).toBe(gif);
  });

  it('finds nothing when the clipboard holds no image', () => {
    expect(findFirstImageFile([fileOf('notes.txt', 'text/plain')])).toBeNull();
    expect(findFirstImageFile([])).toBeNull();
  });
});
