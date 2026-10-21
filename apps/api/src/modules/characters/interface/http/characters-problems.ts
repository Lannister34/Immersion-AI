import { problem } from '../../../../platform/http/problem.js';
import { createProblemTable, type ProblemTable, problemFor } from '../../../../platform/http/problem-table.js';
import { InvalidCharacterCardError } from '../../application/extract-png-character-card.js';
import { CharacterAvatarNotFoundError, CharacterNotFoundError } from '../../application/get-character-avatar.js';
import { InvalidAvatarImageError } from '../../application/upload-character-avatar.js';

export const charactersProblems: ProblemTable = createProblemTable(
  problemFor(CharacterNotFoundError, () => problem(404, 'character_not_found', 'Character not found.')),
  problemFor(CharacterAvatarNotFoundError, () =>
    problem(404, 'avatar_not_found', 'У персонажа нет загруженного аватара.'),
  ),
  problemFor(InvalidAvatarImageError, (error) => problem(400, 'invalid_avatar_image', error.message)),
  problemFor(InvalidCharacterCardError, (error) => problem(400, 'invalid_character_card', error.message)),
);
