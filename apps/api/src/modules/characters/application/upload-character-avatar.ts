import type { CharacterDetailDto, UploadCharacterAvatarCommand } from '@immersion/contracts/characters';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MAX_MEGABYTES } from '@immersion/contracts/common';

import { detectAvatarImageFormat } from './avatar-image-format.js';
import type { CharacterStore } from './character-store.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export class InvalidAvatarImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAvatarImageError';
  }
}

export interface UploadCharacterAvatarDependencies {
  readonly characterStore: Pick<
    CharacterStore,
    'findCharacterSummary' | 'readCharacterDetail' | 'writeCharacterAvatar'
  >;
}

export async function uploadCharacterAvatar(
  characterId: string,
  command: UploadCharacterAvatarCommand,
  { characterStore }: UploadCharacterAvatarDependencies,
): Promise<CharacterDetailDto> {
  const summary = await characterStore.findCharacterSummary(characterId);
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

  await characterStore.writeCharacterAvatar(summary.id, bytes, format.extension);

  const detail = await characterStore.readCharacterDetail(summary.id);
  if (!detail) {
    throw new CharacterNotFoundError(characterId);
  }
  return detail;
}
