import {
  CharacterDetailResponseSchema,
  type UploadCharacterAvatarCommand,
  UploadCharacterAvatarCommandSchema,
} from '@immersion/contracts/characters';

import { apiDeleteNoContent, apiPut } from '../../../shared/api/client';

export function uploadCharacterAvatar(characterId: string, command: UploadCharacterAvatarCommand) {
  return apiPut(
    `/api/characters/${encodeURIComponent(characterId)}/avatar`,
    command,
    UploadCharacterAvatarCommandSchema,
    CharacterDetailResponseSchema,
  );
}

export function deleteCharacterAvatar(characterId: string) {
  return apiDeleteNoContent(`/api/characters/${encodeURIComponent(characterId)}/avatar`);
}
