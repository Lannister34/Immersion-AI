const GATED_DIRECTORY = /^(?:apps\/[^/]+\/src|apps\/web\/dev-server|apps\/web\/tests|packages\/[^/]+\/src)\//;
const TYPESCRIPT_FILE = /\.tsx?$/;
const DECLARATION_FILE = /\.d\.ts$/;
const SPEC_FILE = /\.spec\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;

export function signatureScopeOf(file) {
  if (!GATED_DIRECTORY.test(file) || !TYPESCRIPT_FILE.test(file)) return null;
  if (DECLARATION_FILE.test(file) || SPEC_FILE.test(file)) return null;
  return TEST_FILE.test(file) ? 'test' : 'source';
}
