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
import { runFileRoleGate } from '../src/file-roles/file-role-gate.mjs';
import { RoleGateError } from '../src/file-roles/role-gate-error.mjs';
import { isolatedGitEnvironment, mustGitIn } from './isolated-git.mjs';

const CLI = fileURLToPath(new URL('../src/file-roles/check-file-roles.mjs', import.meta.url));
const GATE_SOURCES = fileURLToPath(new URL('../src/file-roles', import.meta.url));
const TOOLING_MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));
const BASELINE = 'packages/tooling/file-roles-baseline.json';
const UPDATE = 'node check-file-roles.mjs --update-baseline';
const CLIENT_WITH_SCHEMAS = [
  "import { z } from 'zod';",
  'const ResponseSchema = z.object({ text: z.string() });',
  'export class ProviderClient { read(value: unknown) { return ResponseSchema.parse(value); } }',
  '',
].join('\n');
const REPOSITORY_WITH_HELPERS = [
  'export function readAttachment() { return 1; }',
  'export function deleteAttachments() { return 2; }',
  'export class FileChatRepository {}',
  '',
].join('\n');
const temporaryRoots = [];
const temporaryLinks = [];

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-file-roles-'));
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
    runFileRoleGate({ root: work, baselinePath: path.join(work, BASELINE), update, updateCommand: UPDATE });
  const baseline = () => readFileSync(path.join(work, BASELINE), 'utf8');
  const installCli = () => {
    const sources = path.join(work, 'packages/tooling/src/file-roles');
    const modules = path.join(work, 'packages/tooling/node_modules');
    cpSync(GATE_SOURCES, sources, { recursive: true });
    symlinkSync(TOOLING_MODULES, modules, 'junction');
    temporaryLinks.push(modules);
    const cli = path.join(sources, 'check-file-roles.mjs');
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

describe('the file-role gate', () => {
  it('passes a repository whose mixes match the baseline', () => {
    const repository = createRepository();
    repository.track('apps/api/src/provider-client.ts', CLIENT_WITH_SCHEMAS);
    repository.track('apps/api/src/create-chat.ts', 'export function createChat() { return 1; }\n');
    repository.track(BASELINE, '{\n  "apps/api/src/provider-client.ts": "class:1 schema:1"\n}\n');

    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('catches a new violation: a mixed file the baseline does not list', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{}\n');
    repository.track(
      'apps/web/src/chat-screen.tsx',
      [
        'function ChatSkeleton() { return <div />; }',
        'export function ChatScreen() { return <ChatSkeleton />; }',
        '',
      ].join('\n'),
    );

    const { exitCode, lines } = repository.run();

    assert.equal(exitCode, 1);
    assert.deepEqual(lines.slice(0, 3), [
      `apps/web/src/chat-screen.tsx: role mix component:2 where ${BASELINE} allows none`,
      '  apps/web/src/chat-screen.tsx:1  component ChatSkeleton',
      '  apps/web/src/chat-screen.tsx:2  exported component ChatScreen',
    ]);
    assert.equal(
      lines.at(-1),
      'A file is one role: it exports one thing a reader can name, such as a class, a component, a hook, ' +
        'a use case, the schemas of one format or functions that compute one kind of thing, and holds nothing ' +
        'else but private glue only that thing uses. Move each other role into its own file. ' +
        `${BASELINE} only shrinks; the owner alone records an exception in it.`,
    );
  });

  it('catches a regression: a baselined file that gains a role or another declaration of one', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{\n  "apps/api/src/file-chat-repository.ts": "class:1 function:2"\n}\n');
    repository.track('apps/api/src/file-chat-repository.ts', REPOSITORY_WITH_HELPERS);
    assert.equal(repository.run().exitCode, 0);

    repository.write(
      'apps/api/src/file-chat-repository.ts',
      `import { z } from 'zod';\nconst StoredChatSchema = z.object({});\n${REPOSITORY_WITH_HELPERS}`,
    );
    assert.equal(
      repository.run().lines[0],
      `apps/api/src/file-chat-repository.ts: role mix class:1 function:2 schema:1 where ${BASELINE} allows class:1 function:2`,
    );

    repository.write(
      'apps/api/src/file-chat-repository.ts',
      `${REPOSITORY_WITH_HELPERS}export function parseTranscript() { return 3; }\n`,
    );
    assert.equal(repository.run().exitCode, 1);
  });

  it('fails a file below its baseline until --update-baseline lowers the entry', () => {
    const repository = createRepository();
    repository.track(
      BASELINE,
      '{\n  "apps/api/src/file-chat-repository.ts": "class:1 function:2",\n  "apps/api/src/gone.ts": "function:1 schema:1"\n}\n',
    );
    repository.track('apps/api/src/file-chat-repository.ts', 'export function a() {}\nexport class Repository {}\n');

    assert.deepEqual(repository.run(), {
      exitCode: 1,
      lines: [
        `apps/api/src/file-chat-repository.ts: role mix class:1 function:1 where ${BASELINE} still allows class:1 function:2; run ${UPDATE}`,
        `apps/api/src/gone.ts: no gated file where ${BASELINE} still allows function:1 schema:1; run ${UPDATE}`,
      ],
    });
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{\n  "apps/api/src/file-chat-repository.ts": "class:1 function:1"\n}\n');

    repository.write('apps/api/src/file-chat-repository.ts', 'export class Repository {}\n');
    assert.match(repository.run().lines[0], /: one role where .* still allows class:1 function:1/);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{}\n');
  });

  it('never adds or raises an entry on --update-baseline, and still fails what exceeds it', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{\n  "apps/api/src/file-chat-repository.ts": "class:1 function:2"\n}\n');
    repository.track('apps/api/src/file-chat-repository.ts', `${REPOSITORY_WITH_HELPERS}export function c() {}\n`);
    repository.track('apps/api/src/provider-client.ts', CLIENT_WITH_SCHEMAS);

    const { exitCode, lines } = repository.run(true);

    assert.equal(exitCode, 1);
    assert.equal(lines.filter((line) => !line.startsWith(' ')).length, 3);
    assert.equal(repository.baseline(), '{\n  "apps/api/src/file-chat-repository.ts": "class:1 function:2"\n}\n');
  });

  it('records every current mix when the baseline file does not exist', () => {
    const repository = createRepository();
    repository.track('apps/api/src/provider-client.ts', CLIENT_WITH_SCHEMAS);
    repository.track('packages/domain/src/clean.ts', 'export const value = 1;\n');

    assert.equal(repository.run().exitCode, 1);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{\n  "apps/api/src/provider-client.ts": "class:1 schema:1"\n}\n');
  });

  it('gates only tracked sources under apps/*/src and packages/*/src, never tests', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{}\n');
    for (const file of [
      'apps/api/src/provider-client.test.ts',
      'apps/web/src/screen.spec.tsx',
      'apps/web/src/screen.test.jsx',
      'apps/api/src/check.test.mjs',
      'apps/api/src/ambient.d.ts',
      'apps/api/src/ambient.d.mts',
      'apps/api/tests/provider-client.ts',
      'apps/api/tests/src/provider-client.ts',
      'apps/api/provider-client.ts',
      'packages/tooling/test/provider-client.ts',
      'scripts/apps/api/src/provider-client.ts',
      'apps/api/src/provider-client.json',
    ]) {
      repository.track(file, CLIENT_WITH_SCHEMAS);
    }
    repository.write('apps/api/src/untracked-client.ts', CLIENT_WITH_SCHEMAS);

    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('gates a source of every TypeScript and JavaScript extension, and one whose path merely contains test or spec', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{}\n');
    const gated = [
      'apps/api/src/modules/providers/application/test-provider-connection.ts',
      'apps/api/src/test-support/harness.ts',
      'apps/web/src/inspector.tsx',
      'apps/web/src/legacy.jsx',
      'packages/domain/src/provider-client.cts',
      'packages/domain/src/provider-client.mts',
      'packages/test-utils/src/index.ts',
      'packages/tooling/src/provider-client.cjs',
      'packages/tooling/src/provider-client.js',
      'packages/tooling/src/provider-client.mjs',
    ];
    for (const file of gated) {
      repository.track(file, CLIENT_WITH_SCHEMAS);
    }

    assert.deepEqual(
      repository.run().lines.filter((line) => !line.startsWith(' ') && line.includes(': role mix')),
      gated.map((file) => `${file}: role mix class:1 schema:1 where ${BASELINE} allows none`),
    );
  });

  it('refuses to scan when git cannot list the tracked files', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'immersion-file-roles-'));
    temporaryRoots.push(root);
    const missing = path.join(root, 'missing');

    assert.throws(
      () =>
        runFileRoleGate({
          root: missing,
          baselinePath: path.join(missing, BASELINE),
          update: false,
          updateCommand: UPDATE,
        }),
      (error) =>
        error instanceof RoleGateError &&
        error.message.startsWith(`the file-role gate reads the tracked files of ${missing}, and git failed: `),
    );
  });

  it('skips a tracked source gone from the working tree, deleted or with its directory replaced by a file', () => {
    const repository = createRepository();
    repository.track('apps/api/src/provider-client.ts', CLIENT_WITH_SCHEMAS);
    repository.track('apps/api/src/legacy/provider-client.ts', CLIENT_WITH_SCHEMAS);
    rmSync(path.join(repository.work, 'apps/api/src/provider-client.ts'));
    rmSync(path.join(repository.work, 'apps/api/src/legacy'), { recursive: true });
    repository.write('apps/api/src/legacy', '');

    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('takes a tracked path outside ASCII from git verbatim, so it matches its baseline key', () => {
    const repository = createRepository();
    const file = 'apps/api/src/клиент-ü.ts';
    repository.track(file, CLIENT_WITH_SCHEMAS);

    assert.equal(repository.run().lines[0], `${file}: role mix class:1 schema:1 where ${BASELINE} allows none`);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), `{\n  "${file}": "class:1 schema:1"\n}\n`);
    assert.deepEqual(repository.run(), { exitCode: 0, lines: [] });
  });

  it('replaces the baseline through a temporary file, and refuses to update while one is left', () => {
    const repository = createRepository();
    const stored = '{\n  "apps/api/src/gone.ts": "function:1 schema:1"\n}\n';
    const temporary = path.join(repository.work, `${BASELINE}.tmp`);
    repository.track(BASELINE, stored);
    writeFileSync(temporary, '{\n  "apps/api/src/gone.ts": "func');

    assert.throws(
      () => repository.run(true),
      (error) => error instanceof RoleGateError && error.message.startsWith(`${BASELINE}.tmp exists: `),
    );
    assert.equal(repository.baseline(), stored);

    rmSync(temporary);
    assert.deepEqual(repository.run(true), { exitCode: 0, lines: [] });
    assert.equal(repository.baseline(), '{}\n');
    assert.deepEqual(readdirSync(path.dirname(temporary)), ['file-roles-baseline.json']);
  });

  it('takes the update lock before it reads the baseline, so it never lowers a copy read before another update ends', () => {
    const repository = createRepository();
    const temporary = path.join(repository.work, `${BASELINE}.tmp`);
    repository.track(BASELINE, '{\n  "apps/api/src/a.ts": 2\n}\n');
    writeFileSync(temporary, '');

    assert.throws(
      () => repository.run(true),
      (error) => error instanceof RoleGateError && error.message.startsWith(`${BASELINE}.tmp exists: `),
    );
    assert.equal(readFileSync(temporary, 'utf8'), '');
  });

  it('refuses a baseline or a tracked source it cannot read instead of reading it as absent', () => {
    const repository = createRepository();
    const source = 'apps/api/src/provider-client.ts';
    repository.track(source, CLIENT_WITH_SCHEMAS);
    mkdirSync(path.join(repository.work, BASELINE), { recursive: true });

    for (const update of [false, true]) {
      assert.throws(
        () => repository.run(update),
        (error) => error instanceof RoleGateError && error.message.startsWith(`${BASELINE} cannot be read: `),
      );
    }

    rmSync(path.join(repository.work, BASELINE), { recursive: true });
    rmSync(path.join(repository.work, source));
    mkdirSync(path.join(repository.work, source));
    assert.throws(
      () => repository.run(),
      (error) => error instanceof RoleGateError && error.message.startsWith(`${source} cannot be read: `),
    );
  });

  it('refuses a malformed baseline instead of reading it as empty', () => {
    const repository = createRepository();
    repository.track(BASELINE, '{\n  "apps/api/src/a.ts": 2\n}\n');
    repository.track('apps/api/src/provider-client.ts', CLIENT_WITH_SCHEMAS);

    for (const update of [false, true]) {
      assert.throws(
        () => repository.run(update),
        (error) =>
          error instanceof RoleGateError &&
          error.message.startsWith(`${BASELINE} maps apps/api/src/a.ts to 2, which is not a role signature; fix it`),
      );
    }
    assert.equal(repository.baseline(), '{\n  "apps/api/src/a.ts": 2\n}\n');
    assert.deepEqual(readdirSync(path.join(repository.work, 'packages/tooling')), ['file-roles-baseline.json']);
  });

  it('exits 1 from the command line on a report, 0 once the tree and the baseline agree, 2 on a fault', () => {
    const repository = createRepository();
    const runCli = repository.installCli();
    const source = 'apps/api/src/provider-client.ts';
    repository.track(BASELINE, '{\n  "apps/api/src/gone.ts": "function:1 schema:1"\n}\n');
    repository.track(source, CLIENT_WITH_SCHEMAS);

    const failing = runCli();
    assert.equal(failing.status, 1);
    assert.deepEqual(failing.stderr.split('\n').slice(0, 4), [
      `${source}: role mix class:1 schema:1 where ${BASELINE} allows none`,
      `  ${source}:2  schema ResponseSchema`,
      `  ${source}:3  exported class ProviderClient`,
      `apps/api/src/gone.ts: no gated file where ${BASELINE} still allows function:1 schema:1; ` +
        'run node packages/tooling/src/file-roles/check-file-roles.mjs --update-baseline',
    ]);

    repository.write(source, 'export class ProviderClient {}\n');
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
