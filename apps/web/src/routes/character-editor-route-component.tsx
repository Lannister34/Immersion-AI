import { getRouteApi } from '@tanstack/react-router';

import { CharacterEditorScreen } from '../modules/characters';

const characterEditorRouteApi = getRouteApi('/characters/$characterId');

export function CharacterEditorRouteComponent() {
  const { characterId } = characterEditorRouteApi.useParams();
  return <CharacterEditorScreen key={characterId} characterId={characterId} />;
}
