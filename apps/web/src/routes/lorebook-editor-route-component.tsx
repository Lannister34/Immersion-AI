import { getRouteApi } from '@tanstack/react-router';

import { LorebookEditorScreen } from '../modules/lorebooks';

const lorebookEditorRouteApi = getRouteApi('/lorebooks/$lorebookId');

export function LorebookEditorRouteComponent() {
  const { lorebookId } = lorebookEditorRouteApi.useParams();
  return <LorebookEditorScreen lorebookId={lorebookId} />;
}
