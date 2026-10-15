import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_PROJECT, tscProjects, UnreadableTscCommandError } from './package-script-tsc-projects.mjs';
import { repositoryGit } from './repository-git.mjs';
import { isTestPath, testOnlyImports } from './test-file-rules.mjs';
import { packageScriptConfigs, programOf } from './typescript-programs.mjs';

const TYPESCRIPT_FILES = ['*.ts', '*.tsx', '*.mts', '*.cts'];

describe('typecheck and emit programs', () => {
  it('reads the projects a package script runs tsc on', () => {
    assert.deepEqual(tscProjects('tsc -p tsconfig.json --pretty false && tsc --project tsconfig.node.json'), [
      'tsconfig.json',
      'tsconfig.node.json',
    ]);
    assert.deepEqual(tscProjects('tsc --noEmit; vite build'), [DEFAULT_PROJECT]);
    assert.deepEqual(tscProjects('tsc -P tsconfig.build.json'), ['tsconfig.build.json']);
    assert.deepEqual(tscProjects('corepack pnpm -r typecheck'), []);
  });

  for (const script of [
    'tsc -b tsconfig.build.json',
    'tsc --build',
    'tsc tsconfig.build.json',
    'tsc -p',
    'tsc -B tsconfig.build.json',
    'tsc --declaration src/index.ts',
    'npx tsc -p tsconfig.json',
    'node_modules/.bin/tsc -p tsconfig.json',
    'tsc.CMD -p tsconfig.json',
    'pnpm exec tsc -p tsconfig.json',
    'node node_modules/typescript/bin/tsc -p tsconfig.json',
  ]) {
    it(`refuses "${script}" instead of guessing which program it runs`, () => {
      assert.throws(() => tscProjects(script), UnreadableTscCommandError);
    });
  }

  it('tells tests and test support from sources by path', () => {
    const files = [
      'src/a.test.ts',
      'src/b.test.tsx',
      'tests/smoke.spec.ts',
      'src/test-support/guard.ts',
      'src/contest-support/entry.ts',
      'src/latest.ts',
      'src/testing.ts',
    ];

    assert.deepEqual(files.filter(isTestPath), [
      'src/a.test.ts',
      'src/b.test.tsx',
      'tests/smoke.spec.ts',
      'src/test-support/guard.ts',
    ]);
  });

  it('finds vitest and @playwright/test in every import form TypeScript reads, and nowhere else', () => {
    const text = [
      '/// <reference types="vitest/globals" />',
      "import type { Mock } from 'vitest';",
      "export * from '@playwright/test';",
      "const config = await import('vitest/config');",
      "const runner = require('vitest');",
      "import './vitest.js';",
      "import { extra } from 'vitest-extra';",
      "const greeting = 'привет, vitest';",
    ].join('\n');

    assert.deepEqual(testOnlyImports(text), [
      'vitest',
      '@playwright/test',
      'vitest/config',
      'vitest',
      'vitest/globals',
    ]);
  });

  it('sees the tests and their vitest imports in the typecheck programs, so a leak into an emit program shows', () => {
    const files = packageScriptConfigs('typecheck').flatMap((configFile) => programOf(configFile).files);

    assert.ok(files.some((file) => isTestPath(file.path) && testOnlyImports(file.text).includes('vitest')));
  });

  it('puts every tracked TypeScript file in a program that a package typecheck script runs', () => {
    const checked = new Set(
      packageScriptConfigs('typecheck').flatMap((configFile) => programOf(configFile).files.map((file) => file.path)),
    );
    const unchecked = repositoryGit(['ls-files', '-z', '--', ...TYPESCRIPT_FILES])
      .split('\0')
      .filter((file) => file && !checked.has(file));

    assert.deepEqual(unchecked, []);
  });

  it('keeps tests, test support and test-only imports out of every program that emits', () => {
    const configFiles = new Set([...packageScriptConfigs('typecheck'), ...packageScriptConfigs('build')]);
    const emitting = [...configFiles].map(programOf).filter((program) => program.emits);
    const leaks = emitting.flatMap(({ config, files }) =>
      files
        .filter((file) => file.emitted)
        .flatMap((file) => [
          ...(isTestPath(file.path) ? [`${config} emits ${file.path}, a test or test support file`] : []),
          ...testOnlyImports(file.text).map((specifier) => `${config} emits ${file.path}, which imports ${specifier}`),
        ]),
    );

    assert.notDeepEqual(emitting, []);
    assert.deepEqual(leaks, []);
  });
});
