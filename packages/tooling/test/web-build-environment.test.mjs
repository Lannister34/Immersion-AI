import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import typescript from 'typescript';
import { REPOSITORY, repositoryGit } from './repository-git.mjs';

const WEB_SOURCES = 'apps/web/src';
const BUILD_ENVIRONMENT_OWNER = 'apps/web/src/shared/config/web-config.ts';
const SCRIPT_FILE = /\.([cm]?[jt]s|[jt]sx)$/;

function scriptKindOf(file) {
  if (file.endsWith('.tsx')) {
    return typescript.ScriptKind.TSX;
  }

  if (file.endsWith('.jsx')) {
    return typescript.ScriptKind.JSX;
  }

  return /\.[cm]?js$/.test(file) ? typescript.ScriptKind.JS : typescript.ScriptKind.TS;
}

function isImportMeta(node) {
  return typescript.isMetaProperty(node) && node.keywordToken === typescript.SyntaxKind.ImportKeyword;
}

function memberNameReadFrom(importMeta) {
  const { parent } = importMeta;

  if (typescript.isPropertyAccessExpression(parent) && parent.expression === importMeta) {
    return parent.name.text;
  }

  if (
    typescript.isElementAccessExpression(parent) &&
    parent.expression === importMeta &&
    typescript.isStringLiteralLike(parent.argumentExpression)
  ) {
    return parent.argumentExpression.text;
  }

  return null;
}

function buildEnvironmentReads(file, text) {
  const source = typescript.createSourceFile(file, text, typescript.ScriptTarget.Latest, true, scriptKindOf(file));
  const lines = [];

  const visit = (node) => {
    if (isImportMeta(node)) {
      const member = memberNameReadFrom(node);

      if (member === null || member === 'env') {
        lines.push(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
    }

    typescript.forEachChild(node, visit);
  };

  visit(source);

  return lines;
}

function trackedWebScripts() {
  return repositoryGit(['ls-files', '-z', '--', WEB_SOURCES])
    .split('\0')
    .filter((file) => SCRIPT_FILE.test(file));
}

function readsIn(file) {
  return buildEnvironmentReads(file, readFileSync(path.join(REPOSITORY, file), 'utf8'));
}

describe('web build environment', () => {
  it('finds every way to reach import.meta.env, with its line, and leaves the other import.meta members alone', () => {
    const text = [
      'const base = import.meta.env.VITE_API_BASE_URL;',
      "const quoted = import.meta['env'];",
      'const chained = import.meta?.env?.DEV;',
      'const { env } = import.meta;',
      'const meta = import.meta;',
      'const computed = import.meta[key];',
      'const wrapped = (import.meta).env;',
      'const путь = new URL("./путь", import.meta.url);',
      "const modules = import.meta.glob('./*.ts');",
      "const location = import.meta['url'];",
      'import.meta.hot?.accept();',
      "const text = 'import.meta.env';",
      'const element = <p>{import.meta.env.MODE}</p>;',
    ].join('\n');

    assert.deepEqual(buildEnvironmentReads('sample.tsx', text), [1, 2, 3, 4, 5, 6, 7, 13]);
  });

  it('reads import.meta.env in the web config module, so the exemption below names the real owner', () => {
    assert.notDeepEqual(readsIn(BUILD_ENVIRONMENT_OWNER), []);
  });

  it('keeps every other tracked web source from reading import.meta.env', () => {
    const offenders = trackedWebScripts()
      .filter((file) => file !== BUILD_ENVIRONMENT_OWNER)
      .flatMap((file) => readsIn(file).map((line) => `${file}:${line} reads import.meta.env`));

    assert.deepEqual(offenders, []);
  });
});
