import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countBaselineCodec, formatCounts, parseCounts } from '../src/baseline/count-baseline-format.mjs';

class FormatError extends Error {}

const KEYS = new Set(['class', 'function', 'schema', 'explicit-return-type']);
const codec = countBaselineCodec({
  keys: KEYS,
  entry: 'a list of counts',
  example: 'class:1 function:2',
  GateError: FormatError,
});

describe('the count baseline format', () => {
  it('writes counts with keys in a stable order and files sorted by code unit', () => {
    const text = codec.serialize(
      new Map([
        ['apps/web/src/b.tsx', { 'explicit-return-type': 2 }],
        ['apps/api/src/Ä.ts', { schema: 3, class: 1, function: 4 }],
        ['apps/api/src/a.ts', { function: 1, 'explicit-return-type': 12 }],
        ['apps/api/src/B.ts', { class: 1, function: 1 }],
      ]),
    );

    assert.equal(
      text,
      '{\n' +
        '  "apps/api/src/B.ts": "class:1 function:1",\n' +
        '  "apps/api/src/a.ts": "explicit-return-type:12 function:1",\n' +
        '  "apps/api/src/Ä.ts": "class:1 function:4 schema:3",\n' +
        '  "apps/web/src/b.tsx": "explicit-return-type:2"\n' +
        '}\n',
    );
    assert.deepEqual(codec.parse(text).get('apps/api/src/Ä.ts'), { class: 1, function: 4, schema: 3 });
    assert.equal(codec.serialize(new Map()), '{}\n');
  });

  it('reads back what it writes and rejects counts it would never write or keys it does not know', () => {
    assert.deepEqual(parseCounts('class:1 explicit-return-type:12', KEYS), { class: 1, 'explicit-return-type': 12 });
    assert.equal(formatCounts(parseCounts('schema:1 function:2', KEYS)), 'function:2 schema:1');
    for (const text of [
      '',
      'class:0',
      'class:01',
      'class:1x',
      'class',
      '-class:1',
      'constant:1',
      'explicit-return-types:1',
      'class:1  function:1',
      'class:1 class:2',
      'Class:1',
    ]) {
      assert.equal(parseCounts(text, KEYS), null, text);
    }
    assert.equal(parseCounts('constant:1', new Set(['constant'])).constant, 1);
  });

  it('refuses a baseline that is not JSON, not an object, or maps a file to anything but counts, with the error type it was given', () => {
    const refusals = [
      ['{', /^is not valid JSON \(/],
      ['[]', /^must map each file path to a list of counts such as "class:1 function:2"$/],
      ['null', /^must map each file path to a list of counts/],
      ['"class:1"', /^must map each file path to a list of counts/],
      ['{"a.ts": 3}', /^maps a\.ts to 3, which is not a list of counts$/],
      ['{"a.ts": ["class:1"]}', /^maps a\.ts to \["class:1"\], which is not a list of counts$/],
      ['{"a.ts": {"class": 1}}', /^maps a\.ts to \{"class":1\}, which is not a list of counts$/],
      ['{"a.ts": "fn:1"}', /^maps a\.ts to "fn:1", which is not a list of counts$/],
    ];
    for (const [text, message] of refusals) {
      assert.throws(
        () => codec.parse(text),
        (error) => error instanceof FormatError && message.test(error.message),
        text,
      );
    }
  });
});
