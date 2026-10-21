import { getRouteApi } from '@tanstack/react-router';

import { ScenarioEditorScreen } from '../modules/scenarios';

const scenarioEditorRouteApi = getRouteApi('/scenarios/$scenarioId');

export function ScenarioEditorRouteComponent() {
  const { scenarioId } = scenarioEditorRouteApi.useParams();
  return <ScenarioEditorScreen scenarioId={scenarioId} />;
}
