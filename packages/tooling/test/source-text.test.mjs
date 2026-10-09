import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const DELETE = 0x7f;

function isRawControlByte(byte) {
  return (byte < 0x20 && byte !== TAB && byte !== LINE_FEED && byte !== CARRIAGE_RETURN) || byte === DELETE;
}

function findControlBytes(content) {
  const found = [];
  let line = 1;

  for (const byte of content) {
    if (byte === LINE_FEED) {
      line += 1;
    } else if (isRawControlByte(byte)) {
      found.push({ byte, line });
    }
  }

  return found;
}

function git(args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const result = spawnSync('git', args, { cwd: REPOSITORY, encoding: 'utf8', env, input, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function trackedTextFiles() {
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const declaredBinary = new Set(
    git(['check-attr', '--stdin', '-z', 'text'], files.join('\0'))
      .split('\0')
      .reduce((rows, value, index) => {
        if (index % 3 === 0) {
          rows.push([value]);
        } else {
          rows.at(-1).push(value);
        }
        return rows;
      }, [])
      .filter(([, , state]) => state === 'unset')
      .map(([file]) => file),
  );

  return files.filter((file) => !declaredBinary.has(file));
}

describe('source text', () => {
  it('finds raw control bytes with their line, and leaves tabs and line endings alone', () => {
    const content = Buffer.from('const a = 1;\r\n\tconst key = `a\0b`;\nok\x7f\n', 'utf8');

    assert.deepEqual(findControlBytes(content), [
      { byte: 0x00, line: 2 },
      { byte: DELETE, line: 3 },
    ]);
  });

  it('keeps every tracked file free of raw control bytes; a NUL makes git hide its diffs as binary', () => {
    const offenders = trackedTextFiles().flatMap((file) =>
      findControlBytes(readFileSync(path.join(REPOSITORY, file))).map(
        ({ byte, line }) => `${file}:${line} has byte 0x${byte.toString(16).padStart(2, '0')}`,
      ),
    );

    assert.deepEqual(offenders, []);
  });
});
