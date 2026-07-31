import { deleteScenarioFile } from '../infrastructure/file-scenario-repository.js';
import { ScenarioNotFoundError } from './get-scenario.js';

export async function deleteScenario(id: string): Promise<void> {
  const removed = await deleteScenarioFile(id);
  if (!removed) {
    throw new ScenarioNotFoundError(id);
  }
}
