import { listTrackedFiles } from './tracked-files.mjs';
import { TrackedFilesError } from './tracked-files-error.mjs';

export function listTrackedFilesForGate(root, gate, GateError) {
  try {
    return listTrackedFiles(root);
  } catch (error) {
    if (!(error instanceof TrackedFilesError)) throw error;
    throw new GateError(`the ${gate} reads the tracked files of ${root}, and git failed: ${error.detail}`);
  }
}
