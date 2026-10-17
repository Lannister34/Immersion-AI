import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { componentPropsNameRule } from '../src/signatures/component-props-name-rule.mjs';
import { explicitReturnTypeRule } from '../src/signatures/explicit-return-type-rule.mjs';
import { runSignatureGate } from '../src/signatures/signature-gate.mjs';
import { SignatureGateError } from '../src/signatures/signature-gate-error.mjs';
import { isolatedGitEnvironment, mustGitIn } from './isolated-git.mjs';

const CLI = fileURLToPath(new URL('../src/signatures/check-signatures.mjs', import.meta.url));
const TOOLING_SOURCES = fileURLToPath(new URL('../src', import.meta.url));
const TOOLING_MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));
const BASELINE = 'packages/tooling/signature-baseline.json';
const UPDATE = 'node check-signatures.mjs --update-baseline';
const CLOSING = `${BASELINE} only shrinks; the owner alone records an exception in it.`;
const UNTYPED = 'export function format(value: number) { return String(value); }\n';
const TYPED = 'export function format(value: number): string { return String(value); }\n';
const INLINE_PROPS = 'export function Card({ title }: { title: string }) { return <h1>{title}</h1>; }\n';
const temporaryRoots = [];
const temporaryLinks = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-signatures-'));
  temporaryRoots.push(root);
  const work = path.join(root, 'work');
  mkdirSync(work);
  const env = isolatedGitEnvironment(root);
  mustGitIn(work, env, 'init', '-q', '-b', 'main');

  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    writeFileSync(path.join(work, file), content);
  };
  const track = (file, content) => {
    write(file, content);
    mustGitIn(work, env, 'add', '--', file);
  };
  const run = (update = false) =>
    runSignatureGate({ root: work, baselinePath: path.join(work, BASELINE), update, updateCommand: UPDATE });
  const baseline = () => readFileSync(path.join(work, BASELINE), 'utf8');
  const installCli = () => {
    const sources = path.join(work, 'packages/tooling/src');
    const modules = path.join(work, 'packages/tooling/node_modules');
    cpSync(TOOLING_SOURCES, sources, { recursive: true });
    symlinkSync(TOOLING_MODULES, modules, 'junction');
    temporaryLinks.push(modules);
    const cli = path.join(sources, 'signatures/check-signatures.mjs');
    return (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', env });
  };

  return { baseline, installCli, run, track, work, write };
}

afterEach(() => {
  for (const link of temporaryLinks.splice(0)) {
    unlinkSync(link);
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('the signature gate', () => {
  it('passes a repository whose violations match the baseline, which counts every rule', () => {
    const repository = createRepository();
    repository.track('apps/api/src/format.ts', UNTYPED);
    repository.track('apps/web/src/card.tsx', `export function useTitle() { return 'x'; }\n${INLINE_PROPS}`);
    repository.track('apps/api/src/clean.ts', TYPED);
    repository.track(
      BASELINE,
      '{\n' +
        '  "apps/api/src/format.ts": "explicit-return-type:1",\n' +
        '  "apps/web/src/card.tsx": "component-props-name:1 explicit-return-type:1"\n' +
        '}\n',
    );

    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('catches a new violation of each rule in a file the baseline does not list, and states the rules it broke', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{}\n');
    repository.track('apps/web/src/card.tsx', `export function useTitle() { return 'x'; }\n${INLINE_PROPS}`);

    assert.deepEqual(repository.run(), {
      exitCode: 1,
      lines: [
        `apps/web/src/card.tsx: component-props-name:1 explicit-return-type:1 where ${BASELINE} allows none`,
        '  apps/web/src/card.tsx:1:17: explicit-return-type: exported hook useTitle declares no return type',
        '  apps/web/src/card.tsx:2:22: component-props-name: component Card takes its props as an inline object ' +
          'type; declare them as CardProps',
        `component-props-name: ${componentPropsNameRule.statement}`,
        `explicit-return-type: ${explicitReturnTypeRule.statement}`,
        CLOSING,
      ],
    });
  });

  it('catches a regression: a baselined file that gains a violation, listing only the rules it exceeds', () => {
    const repository = createRepository();
    const file = 'apps/web/src/format.tsx';
    repository.track(BASELINE, `{\n  "${file}": "explicit-return-type:1"\n}\n`);
    repository.track(file, UNTYPED);
    assert.equal(repository.run().exitCode, 0);

    repository.write(file, `${UNTYPED}export const parse = (text: string) => Number(text);\n`);
    assert.deepEqual(repository.run().lines, [
      `${file}: explicit-return-type:2 where ${BASELINE} allows explicit-return-type:1`,
      `  ${file}:1:17: explicit-return-type: exported function format declares no return type`,
      `  ${file}:2:14: explicit-return-type: exported function parse declares no return type`,
      `explicit-return-type: ${explicitReturnTypeRule.statement}`,
      CLOSING,
    ]);

    repository.write(file, `${UNTYPED}${INLINE_PROPS}`);
    assert.deepEqual(repository.run().lines.slice(0, 2), [
      `${file}: component-props-name:1 explicit-return-type:1 where ${BASELINE} allows explicit-return-type:1`,
      `  ${file}:2:22: component-props-name: component Card takes its props as an inline object type; ` +
        'declare them as CardProps',
    ]);
  });

  it('fails a file below its baseline until --update-baseline lowers the entry', () => {
    const repository = createRepository();
    repository.track(
      BASELINE,
      '{\n  "apps/api/src/format.ts": "explicit-return-type:2",\n  "apps/api/src/gone.ts": "explicit-return-type:1"\n}\n',
    );
    repository.track('apps/api/src/format.ts', UNTYPED);

    assert.deepEqual(repository.run(), {
      exitCode: 1,
      lines: [
        `apps/api/src/format.ts: explicit-return-type:1 where ${BASELINE} still allows explicit-return-type:2; run ${UPDATE}`,
        `apps/api/src/gone.ts: no gated file where ${BASELINE} still allows explicit-return-type:1; run ${UPDATE}`,
      ],
    });
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{\n  "apps/api/src/format.ts": "explicit-return-type:1"\n}\n');

    repository.write('apps/api/src/format.ts', TYPED);
    assert.deepEqual(repository.run().lines, [
      `apps/api/src/format.ts: no violation where ${BASELINE} still allows explicit-return-type:1; run ${UPDATE}`,
    ]);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{}\n');
  });

  it('never adds or raises an entry on --update-baseline, and still fails what exceeds it', () => {
    const repository = createRepository();
    const stored = '{\n  "apps/api/src/format.ts": "explicit-return-type:1"\n}\n';
    repository.track(BASELINE, stored);
    repository.track('apps/api/src/format.ts', `${UNTYPED}export const parse = (text: string) => Number(text);\n`);
    repository.track('apps/web/src/card.tsx', INLINE_PROPS);

    const { exitCode, lines } = repository.run(true);

    assert.equal(exitCode, 1);
    assert.equal(lines.filter((line) => line.includes(' where ')).length, 2);
    assert.equal(repository.baseline(), stored);
  });

  it('records every current violation when the baseline file does not exist', () => {
    const repository = createRepository();
    repository.track('apps/api/src/format.ts', UNTYPED);
    repository.track('apps/web/src/card.tsx', INLINE_PROPS);
    repository.track('packages/domain/src/clean.ts', TYPED);

    assert.equal(repository.run().exitCode, 1);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(
      repository.baseline(),
      '{\n' +
        '  "apps/api/src/format.ts": "explicit-return-type:1",\n' +
        '  "apps/web/src/card.tsx": "component-props-name:1"\n' +
        '}\n',
    );
  });

  it('gates only tracked TypeScript in scope, and a test file only for the props of its components', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{}\n');
    for (const file of [
      'apps/web/tests/smoke.spec.ts',
      'apps/web/src/screen.spec.tsx',
      'apps/api/src/ambient.d.ts',
      'apps/api/src/legacy.mjs',
      'apps/api/src/check.mts',
      'apps/api/tests/format.ts',
      'apps/api/format.ts',
      'apps/web/vite.config.ts',
      'packages/tooling/test/format.ts',
      'scripts/apps/api/src/format.ts',
    ]) {
      repository.track(file, UNTYPED);
    }
    repository.write('apps/api/src/untracked.ts', UNTYPED);
    repository.track('apps/web/src/card.test.tsx', `${UNTYPED}${INLINE_PROPS}`);
    repository.track('apps/web/tests/smoke-data-root.ts', UNTYPED);
    repository.track('apps/web/dev-server/boundary.ts', UNTYPED);

    assert.deepEqual(
      repository.run().lines.filter((line) => line.includes(' where ')),
      [
        `apps/web/dev-server/boundary.ts: explicit-return-type:1 where ${BASELINE} allows none`,
        `apps/web/src/card.test.tsx: component-props-name:1 where ${BASELINE} allows none`,
        `apps/web/tests/smoke-data-root.ts: explicit-return-type:1 where ${BASELINE} allows none`,
      ],
    );
  });

  it('refuses to scan when git cannot list the tracked files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'immersion-signatures-'));
    temporaryRoots.push(root);
    const missing = path.join(root, 'missing');

    assert.throws(
      () =>
        runSignatureGate({
          root: missing,
          baselinePath: path.join(missing, BASELINE),
          update: false,
          updateCommand: UPDATE,
        }),
      (error) =>
        error instanceof SignatureGateError &&
        error.message.startsWith(`the signature gate reads the tracked files of ${missing}, and git failed: `),
    );
  });

  it('skips a tracked source gone from the working tree, deleted or with its directory replaced by a file', () => {
    const repository = createRepository();
    repository.track('apps/api/src/format.ts', UNTYPED);
    repository.track('apps/api/src/legacy/format.ts', UNTYPED);
    rmSync(path.join(repository.work, 'apps/api/src/format.ts'));
    rmSync(path.join(repository.work, 'apps/api/src/legacy'), { recursive: true });
    repository.write('apps/api/src/legacy', '');

    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('takes a tracked path outside ASCII from git verbatim, so it matches its baseline key', () => {
    const repository = createRepository();
    const file = 'apps/api/src/формат-ü.ts';
    repository.track(file, UNTYPED);

    assert.equal(repository.run().lines[0], `${file}: explicit-return-type:1 where ${BASELINE} allows none`);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), `{\n  "${file}": "explicit-return-type:1"\n}\n`);
    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('replaces the baseline through a temporary file, and refuses to update while one is left', () => {
    const repository = createRepository();
    const stored = '{\n  "apps/api/src/gone.ts": "explicit-return-type:1"\n}\n';
    const temporary = path.join(repository.work, `${BASELINE}.tmp`);
    repository.track(BASELINE, stored);
    writeFileSync(temporary, '{\n  "apps/api/src/gone.ts": "expl');

    assert.throws(
      () => repository.run(true),
      (error) => error instanceof SignatureGateError && error.message.startsWith(`${BASELINE}.tmp exists: `),
    );
    assert.equal(repository.baseline(), stored);

    rmSync(temporary);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{}\n');
    assert.deepEqual(readdirSync(path.dirname(temporary)), ['signature-baseline.json']);
  });

  it('refuses a baseline or a tracked source it cannot read instead of reading it as absent', () => {
    const repository = createRepository();
    const source = 'apps/api/src/format.ts';
    repository.track(source, UNTYPED);
    mkdirSync(path.join(repository.work, BASELINE), { recursive: true });

    for (const update of [false, true]) {
      assert.throws(
        () => repository.run(update),
        (error) => error instanceof SignatureGateError && error.message.startsWith(`${BASELINE} cannot be read: `),
      );
    }

    rmSync(path.join(repository.work, BASELINE), { recursive: true });
    rmSync(path.join(repository.work, source));
    mkdirSync(path.join(repository.work, source));
    assert.throws(
      () => repository.run(),
      (error) => error instanceof SignatureGateError && error.message.startsWith(`${source} cannot be read: `),
    );
  });

  it('refuses a malformed baseline instead of reading it as empty, and leaves it in place', () => {
    const repository = createRepository();
    const stored = '{\n  "apps/api/src/format.ts": "class:1"\n}\n';
    repository.track(BASELINE, stored);
    repository.track('apps/api/src/format.ts', UNTYPED);

    for (const update of [false, true]) {
      assert.throws(
        () => repository.run(update),
        (error) =>
          error instanceof SignatureGateError &&
          error.message.startsWith(
            `${BASELINE} maps apps/api/src/format.ts to "class:1", which is not a list of rule counts; fix it`,
          ),
      );
    }
    assert.equal(repository.baseline(), stored);
    assert.deepEqual(readdirSync(path.join(repository.work, 'packages/tooling')), ['signature-baseline.json']);
  });

  it('exits 1 from the command line on a report, 0 once the tree and the baseline agree, 2 on a fault', () => {
    const repository = createRepository();
    const runCli = repository.installCli();
    const source = 'apps/api/src/format.ts';
    repository.track(BASELINE, '{\n  "apps/api/src/gone.ts": "explicit-return-type:1"\n}\n');
    repository.track(source, UNTYPED);

    const failing = runCli();
    assert.equal(failing.status, 1);
    assert.deepEqual(failing.stderr.split('\n').slice(0, 3), [
      `${source}: explicit-return-type:1 where ${BASELINE} allows none`,
      `  ${source}:1:17: explicit-return-type: exported function format declares no return type`,
      `apps/api/src/gone.ts: no gated file where ${BASELINE} still allows explicit-return-type:1; ` +
        'run node packages/tooling/src/signatures/check-signatures.mjs --update-baseline',
    ]);

    repository.write(source, TYPED);
    const updated = runCli('--update-baseline');
    assert.deepEqual([updated.status, updated.stderr], [0, '']);
    assert.equal(repository.baseline(), '{}\n');
    const passing = runCli();
    assert.deepEqual([passing.status, passing.stderr], [0, '']);

    rmSync(path.join(repository.work, BASELINE));
    mkdirSync(path.join(repository.work, BASELINE));
    const faulted = runCli();
    assert.equal(faulted.status, 2);
    assert.ok(faulted.stderr.startsWith(`${BASELINE} cannot be read: `), faulted.stderr);
  });

  it('exits 2 on an unknown argument from the command line', () => {
    const result = spawnSync(process.execPath, [CLI, '--update'], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.equal(result.stderr, 'unknown argument --update; the only option is --update-baseline\n');
  });
});
