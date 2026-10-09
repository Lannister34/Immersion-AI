import type { CharacterDetailDto } from '@immersion/contracts/characters';

import {
  characterAvatarUrlFor,
  createCharacterFile,
  writeCharacterAvatarFile,
} from '../infrastructure/file-character-repository.js';
import {
  extractPngCharacterCard,
  InvalidCharacterCardError,
  stripPngCharacterCardChunks,
} from './extract-png-character-card.js';

export interface ImportCharacterCardInput {
  contentBase64: string;
  fileName: string;
}

export async function importCharacterCard(input: ImportCharacterCardInput): Promise<CharacterDetailDto> {
  const lower = input.fileName.toLowerCase();
  if (!lower.endsWith('.png')) {
    throw new InvalidCharacterCardError('Only PNG character cards can be imported in this slice.');
  }

  const pngBuffer = Buffer.from(input.contentBase64, 'base64');
  if (pngBuffer.length === 0) {
    throw new InvalidCharacterCardError('Uploaded file is empty.');
  }

  const card = extractPngCharacterCard(pngBuffer);

  const detail = await createCharacterFile({
    description: card.description,
    exampleDialogue: card.exampleDialogue,
    firstMessage: card.firstMessage,
    name: card.name,
    personality: card.personality,
    scenario: card.scenario,
    systemPrompt: card.systemPrompt,
    tags: card.tags,
  });

  await writeCharacterAvatarFile(detail.id, stripPngCharacterCardChunks(pngBuffer), '.png');

  return {
    ...detail,
    avatarUrl: await characterAvatarUrlFor(detail.id),
  };
}
