import { typescript } from './repository-typescript.mjs';

const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/;
const TEST_SUPPORT_FOLDER = /(^|\/)test-support\//;
const TEST_ONLY_MODULES = ['vitest', '@playwright/test'];

export function isTestPath(file) {
  return TEST_FILE.test(file) || TEST_SUPPORT_FOLDER.test(file);
}

export function testOnlyImports(text) {
  const { importedFiles, typeReferenceDirectives } = typescript.preProcessFile(text, true, true);

  return [...importedFiles, ...typeReferenceDirectives]
    .map(({ fileName }) => fileName)
    .filter((specifier) => TEST_ONLY_MODULES.some((name) => specifier === name || specifier.startsWith(`${name}/`)));
}
