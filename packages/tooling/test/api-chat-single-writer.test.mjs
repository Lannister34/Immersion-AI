import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import typescript from 'typescript';
import { calleeName } from '../src/ast/callee-name.mjs';
import { unwrapExpression } from '../src/ast/unwrap-expression.mjs';
import { REPOSITORY, repositoryGit } from './repository-git.mjs';
import { isTestPath } from './test-file-rules.mjs';

const API_SOURCES = 'apps/api/src';
const COMPOSITION_ROOT = 'apps/api/src/composition/api-dependencies.ts';
const SINGLE_INSTANCE_CLASSES = new Set(['FileChatRepository', 'InMemoryChatIndex']);
const TYPESCRIPT_FILE = /\.[cm]?ts$/;

function importedClassAliases(source) {
  const aliases = new Map([...SINGLE_INSTANCE_CLASSES].map((name) => [name, name]));

  for (const statement of source.statements) {
    const bindings = typescript.isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined;

    if (bindings !== undefined && typescript.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;

        if (SINGLE_INSTANCE_CLASSES.has(imported)) {
          aliases.set(element.name.text, imported);
        }
      }
    }
  }

  return aliases;
}

function singleInstanceConstructions(file, text) {
  const source = typescript.createSourceFile(
    file,
    text,
    typescript.ScriptTarget.Latest,
    true,
    typescript.ScriptKind.TS,
  );
  const aliases = importedClassAliases(source);
  const found = [];

  const record = (expression, node) => {
    const name = calleeName(unwrapExpression(expression).value);
    const constructed = name === null ? undefined : aliases.get(name);

    if (constructed !== undefined) {
      found.push(`${constructed}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
    }
  };

  const visit = (node) => {
    if (typescript.isNewExpression(node)) {
      record(node.expression, node);
    } else if (typescript.isHeritageClause(node) && node.token === typescript.SyntaxKind.ExtendsKeyword) {
      for (const type of node.types) {
        record(type.expression, type);
      }
    }

    typescript.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

function trackedApiSources() {
  return repositoryGit(['ls-files', '-z', '--', API_SOURCES])
    .split('\0')
    .filter((file) => TYPESCRIPT_FILE.test(file) && !isTestPath(file));
}

function constructionsIn(file) {
  return singleInstanceConstructions(file, readFileSync(path.join(REPOSITORY, file), 'utf8'));
}

describe('api chat single writer', () => {
  it('finds every construction of the chat repository and chat index, with its line, through aliases and wrappers', () => {
    const text = [
      "import { FileChatRepository as Repository } from '../modules/chats/index.js';",
      "import * as indexing from '../modules/indexing/index.js';",
      'const direct = new FileChatRepository(options);',
      'const aliased = new Repository(options);',
      'const qualified = new indexing.InMemoryChatIndex(options);',
      'const wrapped = new (InMemoryChatIndex as typeof Index)(options);',
      'class Extended extends Repository {}',
      'let typed: FileChatRepository;',
      "const text = 'new FileChatRepository()';",
      'const other = new FileChatRepositoryFactory();',
    ].join('\n');

    assert.deepEqual(singleInstanceConstructions('sample.ts', text), [
      'FileChatRepository:3',
      'FileChatRepository:4',
      'InMemoryChatIndex:5',
      'InMemoryChatIndex:6',
      'FileChatRepository:7',
    ]);
  });

  it('constructs the chat repository and the chat index in the composition root, so the exemption below names the real owner', () => {
    assert.deepEqual(
      constructionsIn(COMPOSITION_ROOT).map((construction) => construction.split(':')[0]),
      ['FileChatRepository', 'InMemoryChatIndex'],
    );
  });

  it('keeps every other tracked api source from constructing a chat repository or a chat index', () => {
    const offenders = trackedApiSources()
      .filter((file) => file !== COMPOSITION_ROOT)
      .flatMap((file) => constructionsIn(file).map((construction) => `${file}:${construction}`));

    assert.deepEqual(offenders, []);
  });
});
