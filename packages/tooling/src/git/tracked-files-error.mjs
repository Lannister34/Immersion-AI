export class TrackedFilesError extends Error {
  name = 'TrackedFilesError';

  constructor(root, detail) {
    super(`git cannot list the tracked files of ${root}: ${detail}`);
    this.root = root;
    this.detail = detail;
  }
}
