import type { CharacterAvatarMimeType } from '@immersion/contracts/characters';

export interface AvatarImageFormat {
  extension: '.png' | '.jpg' | '.webp';
  mimeType: CharacterAvatarMimeType;
}

const PNG_FORMAT: AvatarImageFormat = { extension: '.png', mimeType: 'image/png' };
const JPEG_FORMAT: AvatarImageFormat = { extension: '.jpg', mimeType: 'image/jpeg' };
const WEBP_FORMAT: AvatarImageFormat = { extension: '.webp', mimeType: 'image/webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_TAG = Buffer.from('WEBP', 'ascii');

export function detectAvatarImageFormat(bytes: Buffer): AvatarImageFormat | null {
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return PNG_FORMAT;
  }
  if (bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) {
    return JPEG_FORMAT;
  }
  if (bytes.subarray(0, RIFF_SIGNATURE.length).equals(RIFF_SIGNATURE) && bytes.subarray(8, 12).equals(WEBP_TAG)) {
    return WEBP_FORMAT;
  }
  return null;
}

export function avatarContentTypeOf(bytes: Buffer): string {
  return detectAvatarImageFormat(bytes)?.mimeType ?? 'application/octet-stream';
}
