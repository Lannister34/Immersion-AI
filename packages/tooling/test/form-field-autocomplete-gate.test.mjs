import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isolatedGitEnvironment, mustGitIn } from './isolated-git.mjs';

const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
const BIOME = path.join(REPOSITORY, 'node_modules/@biomejs/biome/bin/biome');
const FIXTURE = 'apps/web/src/fixture-form.tsx';
const PLUGIN = 'packages/tooling/src/lint-plugins/form-field-autocomplete-off.grit';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function lintWithRepositoryConfig(fieldMarkup) {
  const root = mkdtempSync(path.join(tmpdir(), 'immersion-autocomplete-'));
  temporaryRoots.push(root);
  const work = path.join(root, 'work');
  mkdirSync(work);
  mustGitIn(work, isolatedGitEnvironment(root), 'init', '-q', '-b', 'main');

  const config = readFileSync(path.join(REPOSITORY, 'biome.json'), 'utf8');
  writeFileSync(path.join(work, 'biome.json'), config);
  writeFileSync(path.join(work, '.gitignore'), '');
  for (const plugin of JSON.parse(config).plugins ?? []) {
    const target = path.join(work, plugin);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(REPOSITORY, plugin), target);
  }
  const fixture = path.join(work, FIXTURE);
  mkdirSync(path.dirname(fixture), { recursive: true });
  writeFileSync(
    fixture,
    `export function FixtureForm() {\n  return (\n    <form>\n      ${fieldMarkup}\n    </form>\n  );\n}\n`,
  );

  const result = spawnSync(process.execPath, [BIOME, 'lint', '--colors=off', FIXTURE], { cwd: work, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('form field autocomplete gate', () => {
  it('is loaded by the repository biome.json', () => {
    const config = JSON.parse(readFileSync(path.join(REPOSITORY, 'biome.json'), 'utf8'));

    assert.ok(config.plugins?.includes(`./${PLUGIN}`), `plugins: ${JSON.stringify(config.plugins)}`);
  });

  for (const field of [
    '<input className="input" value="Эля" />',
    '<textarea rows={3} />',
    '<select value="a"><option>a</option></select>',
    '<input type="password" />',
    '<input autoComplete="off" type="password" />',
    '<input autoComplete="new-password" />',
    '<input autoComplete="on" />',
    '<input {...props} />',
    '<input autoComplete="off" {...props} />',
  ]) {
    it(`fails lint on ${field}`, () => {
      const { status, output } = lintWithRepositoryConfig(field);

      assert.notEqual(status, 0, output);
      assert.match(output, /Form fields take autoComplete off, and password fields new-password/);
    });
  }

  for (const field of [
    '<input autoComplete="off" className="input" value="Эля" />',
    '<textarea autoComplete="off" rows={3}>{"text"}</textarea>',
    '<select autoComplete="off" value="a"><option>a</option></select>',
    '<input autoComplete="new-password" type="password" />',
    '<input checked readOnly type="checkbox" />',
    '<input readOnly type="radio" />',
    '<input readOnly type="range" />',
    '<input type="file" />',
    '<input type="hidden" value="x" />',
    '<Input className="input" />',
  ]) {
    it(`passes lint on ${field}`, () => {
      const { status, output } = lintWithRepositoryConfig(field);

      assert.equal(status, 0, output);
    });
  }
});
