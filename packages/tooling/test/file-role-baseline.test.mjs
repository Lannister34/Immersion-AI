import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatCounts, parseCounts } from '../src/baseline/count-baseline-format.mjs';
import { classifyDeclarations } from '../src/file-roles/declaration-kinds.mjs';
import { SIGNATURE_KINDS } from '../src/file-roles/role-kinds.mjs';
import { roleMix } from '../src/file-roles/role-mix.mjs';

describe('the role baseline keys', () => {
  it('read back a signature holding every kind the role mix counts', () => {
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
    const text = formatCounts(mix.signature);

    assert.equal(text, 'class:1 component:1 function:1 hook:1 schema:1 type:1');
    assert.deepEqual(parseCounts(text, SIGNATURE_KINDS), mix.signature);
  });

  it('refuse a kind the role mix never counts', () => {
    for (const text of ['constant:1', 'error:1', 'explicit-return-type:1']) {
      assert.equal(parseCounts(text, SIGNATURE_KINDS), null, text);
    }
  });
});
