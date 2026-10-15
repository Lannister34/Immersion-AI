import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDeclarations } from '../src/file-roles/declaration-kinds.mjs';
import {
  formatSignature,
  parseRoleBaseline,
  parseSignature,
  serializeRoleBaseline,
} from '../src/file-roles/role-baseline-format.mjs';
import { compareWithBaseline, lowerBaseline } from '../src/file-roles/role-baseline-ratchet.mjs';
import { RoleGateError } from '../src/file-roles/role-gate-error.mjs';
import { roleMix } from '../src/file-roles/role-mix.mjs';

describe('the role baseline format', () => {
  it('writes signatures with kinds in a stable order and files sorted by code unit', () => {
    const text = serializeRoleBaseline(
      new Map([
        ['apps/web/src/b.tsx', { component: 2 }],
        ['apps/api/src/Ä.ts', { schema: 3, class: 1, function: 4 }],
        ['apps/api/src/a.ts', { function: 1, schema: 1 }],
        ['apps/api/src/B.ts', { class: 1, function: 1 }],
      ]),
    );

    assert.equal(
      text,
      '{\n' +
        '  "apps/api/src/B.ts": "class:1 function:1",\n' +
        '  "apps/api/src/a.ts": "function:1 schema:1",\n' +
        '  "apps/api/src/Ä.ts": "class:1 function:4 schema:3",\n' +
        '  "apps/web/src/b.tsx": "component:2"\n' +
        '}\n',
    );
    assert.deepEqual(parseRoleBaseline(text).get('apps/api/src/Ä.ts'), { class: 1, function: 4, schema: 3 });
    assert.equal(serializeRoleBaseline(new Map()), '{}\n');
  });

  it('reads back what it writes and rejects signatures it would never write', () => {
    assert.deepEqual(parseSignature('class:1 function:12'), { class: 1, function: 12 });
    assert.equal(formatSignature(parseSignature('type:1 hook:2')), 'hook:2 type:1');
    for (const text of [
      '',
      'class:0',
      'class:01',
      'class:1x',
      '-class:1',
      'constant:1',
      'class:1  function:1',
      'class:1 class:2',
      'Class:1',
    ]) {
      assert.equal(parseSignature(text), null, text);
    }
  });

  it('reads back a signature holding every kind the role mix counts', () => {
    const mix = roleMix(
      classifyDeclarations(
        'everything.tsx',
        [
          "import { z } from 'zod';",
          'export type Unused = string;',
          'export const ItemSchema = z.object({});',
          'export class ItemStore {}',
          'export function useItems() { return []; }',
          'export function formatItem() { return ""; }',
          'export function ItemRow() { return <li />; }',
        ].join('\n'),
      ),
    );
    const text = formatSignature(mix.signature);

    assert.equal(text, 'class:1 component:1 function:1 hook:1 schema:1 type:1');
    assert.deepEqual(parseSignature(text), mix.signature);
  });

  it('refuses a baseline that is not JSON, not an object, or maps a file to anything but a signature string', () => {
    for (const text of ['{', '[]', 'null', '{"a.ts": 3}', '{"a.ts": ["class:1"]}', '{"a.ts": "fn:1"}']) {
      assert.throws(() => parseRoleBaseline(text), RoleGateError, text);
    }
  });
});

describe('the role baseline ratchet', () => {
  const baseline = new Map([
    ['repository.ts', { class: 1, function: 4 }],
    ['screen.tsx', { component: 3 }],
    ['deleted.ts', { function: 1, schema: 1 }],
  ]);

  it('passes files that match their entry and clean files without one', () => {
    const found = new Map([
      ['repository.ts', { class: 1, function: 4 }],
      ['screen.tsx', { component: 3 }],
      ['deleted.ts', { schema: 1, function: 1 }],
      ['clean.ts', null],
    ]);

    assert.deepEqual(compareWithBaseline(found, baseline), { over: [], stale: [] });
  });

  it('fails a new mix in a file the baseline does not list', () => {
    const found = new Map([['new-client.ts', { class: 1, schema: 2 }]]);

    assert.deepEqual(compareWithBaseline(found, new Map()).over, [
      { file: 'new-client.ts', signature: { class: 1, schema: 2 }, allowed: null },
    ]);
  });

  it('fails a baselined file that gains a role or more of one, even while losing another', () => {
    const found = new Map([
      ['repository.ts', { class: 1, function: 3, schema: 1 }],
      ['screen.tsx', { component: 4 }],
    ]);
    const { over } = compareWithBaseline(found, baseline);

    assert.deepEqual(
      over.map(({ file }) => file),
      ['repository.ts', 'screen.tsx'],
    );
  });

  it('fails a file below its entry, a file now holding one role, and an entry with no gated file', () => {
    const found = new Map([
      ['repository.ts', { class: 1, function: 2 }],
      ['screen.tsx', null],
    ]);
    const { over, stale } = compareWithBaseline(found, baseline);

    assert.deepEqual(over, []);
    assert.deepEqual(
      stale.map(({ file, scanned }) => `${file} ${scanned ? 'scanned' : 'gone'}`),
      ['repository.ts scanned', 'screen.tsx scanned', 'deleted.ts gone'],
    );
  });

  it('lowers entries to what remains and drops fixed or missing files, never adding or raising', () => {
    const found = new Map([
      ['repository.ts', { class: 1, function: 6, schema: 1 }],
      ['screen.tsx', { component: 2 }],
      ['new-client.ts', { class: 1, schema: 2 }],
    ]);

    assert.deepEqual(
      lowerBaseline(found, baseline),
      new Map([
        ['repository.ts', { class: 1, function: 4 }],
        ['screen.tsx', { component: 2 }],
      ]),
    );
    assert.deepEqual(lowerBaseline(new Map([['repository.ts', { component: 2 }]]), baseline), new Map());
  });

  it('records every mix when there is no baseline yet', () => {
    const found = new Map([
      ['client.ts', { class: 1, schema: 2 }],
      ['clean.ts', null],
    ]);

    assert.deepEqual(lowerBaseline(found, null), new Map([['client.ts', { class: 1, schema: 2 }]]));
  });
});
