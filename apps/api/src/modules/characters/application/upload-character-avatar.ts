import type { CharacterDetailDto, UploadCharacterAvatarCommand } from '@immersion/contracts/characters';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_MEGABYTES } from '@immersion/contracts/common';

import {
  findCharacterFile,
  readCharacterDetail,
  writeCharacterAvatarFile,
} from '../infrastructure/file-character-repository.js';
import { detectAvatarImageFormat } from './avatar-image-format.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export class InvalidAvatarImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarImageError';
  }
}

export async function uploadCharacterAvatar(
  characterId: string,
  command: UploadCharacterAvatarCommand,
): Promise<CharacterDetailDto> {
  const summary = await findCharacterFile(characterId);
  if (!summary) {
    throw new CharacterNotFoundError(characterId);
  }

  const bytes = Buffer.from(command.contentBase64, 'base64');
  if (bytes.length === 0) {
    throw new InvalidAvatarImageError('Файл аватара пуст.');
  }
  if (bytes.length > IMAGE_UPLOAD_MAX_BYTES) {
    throw new InvalidAvatarImageError(`Файл аватара больше ${IMAGE_UPLOAD_MAX_MEGABYTES} МБ.`);
  }

  const format = detectAvatarImageFormat(bytes);
  if (!format || format.mimeType !== command.mimeType) {
    throw new InvalidAvatarImageError('Содержимое файла не совпадает с заявленным форматом изображения.');
  }

  await writeCharacterAvatarFile(summary.id, bytes, format.extension);

  const detail = await readCharacterDetail(summary.id);
  if (!detail) {
    throw new CharacterNotFoundError(characterId);
  }
  return detail;
}
