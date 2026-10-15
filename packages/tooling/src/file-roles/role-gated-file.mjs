const SOURCE_FILE = /^(?:apps|packages)\/[^/]+\/src\/.+\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

export function isRoleGatedFile(file) {
  return SOURCE_FILE.test(file) && !TEST_FILE.test(file) && !DECLARATION_FILE.test(file);
}
