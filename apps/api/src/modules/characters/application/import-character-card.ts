import type { CharacterDetailDto } from '@immersion/contracts/characters';

import type { Clock } from '../../../platform/clock/clock.js';
import type { CharacterStore } from './character-store.js';
import {
  extractPngCharacterCard,
  InvalidCharacterCardError,
  stripPngCharacterCardChunks,
} from './extract-png-character-card.js';
import { CharacterNotFoundError } from './get-character-avatar.js';

export interface ImportCharacterCardInput {
  contentBase64: string;
  fileName: string;
}

export interface ImportCharacterCardDependencies {
  readonly characterStore: Pick<CharacterStore, 'createCharacter' | 'readCharacterDetail' | 'writeCharacterAvatar'>;
  readonly clock: Clock;
}

export async function importCharacterCard(
  input: ImportCharacterCardInput,
  { characterStore, clock }: ImportCharacterCardDependencies,
): Promise<CharacterDetailDto> {
  const lower = input.fileName.toLowerCase();
  if (!lower.endsWith('.png')) {
    throw new InvalidCharacterCardError('Only PNG character cards can be imported in this slice.');
  }

  const pngBuffer = Buffer.from(input.contentBase64, 'base64');
  if (pngBuffer.length === 0) {
    throw new InvalidCharacterCardError('Uploaded file is empty.');
  }

  const card = extractPngCharacterCard(pngBuffer);

  const created = await characterStore.createCharacter(
    {
      description: card.description,
      exampleDialogue: card.exampleDialogue,
      firstMessage: card.firstMessage,
      name: card.name,
      personality: card.personality,
      scenario: card.scenario,
      systemPrompt: card.systemPrompt,
      tags: card.tags,
    },
    clock.now().toISOString(),
  );

  await characterStore.writeCharacterAvatar(created.id, stripPngCharacterCardChunks(pngBuffer), '.png');

  const detail = await characterStore.readCharacterDetail(created.id);
  if (!detail) {
    throw new CharacterNotFoundError(created.id);
  }
  return detail;
}
