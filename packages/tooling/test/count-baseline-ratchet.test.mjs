import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareWithBaseline, lowerBaseline } from '../src/baseline/count-baseline-ratchet.mjs';

describe('the count baseline ratchet', () => {
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
      { file: 'new-client.ts', counts: { class: 1, schema: 2 }, allowed: null, exceeded: ['class', 'schema'] },
    ]);
  });

  it('fails a baselined file that gains a role or more of one, even while losing another, naming what it exceeds', () => {
    const found = new Map([
      ['repository.ts', { class: 1, function: 3, schema: 1 }],
      ['screen.tsx', { component: 4 }],
    ]);
    const { over } = compareWithBaseline(found, baseline);

    assert.deepEqual(
      over.map(({ file, exceeded }) => `${file} ${exceeded.join(' ')}`),
      ['repository.ts schema', 'screen.tsx component'],
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
