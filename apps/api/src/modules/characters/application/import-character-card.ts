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

  // Reuse the file repo's createCharacterFile: it picks a non-clashing JSON id.
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

  // The card PNG becomes the sibling avatar of the imported JSON card. The chara chunk is
  // stripped so the stored avatar is a plain image, never a second character card.
  await writeCharacterAvatarFile(detail.id, stripPngCharacterCardChunks(pngBuffer), '.png');

  return {
    ...detail,
    avatarUrl: await characterAvatarUrlFor(detail.id),
  };
}
