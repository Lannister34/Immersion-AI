import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPOSITORY } from './repository-git.mjs';

const WEB_SOURCES = path.join(REPOSITORY, 'apps/web/src');
const SECTION_DIRECTORY = path.join(WEB_SOURCES, 'styles');
const MEDIA_QUERIES_MODULE = path.join(WEB_SOURCES, 'shared/lib/media-queries.ts');
const MEDIA_RULE = /@media\s+([^{]+)\{/g;
const EXPORTED_QUERY = /^export const [A-Z_]+_QUERY = '([^']+)';$/gm;

function scriptQueries() {
  return [...readFileSync(MEDIA_QUERIES_MODULE, 'utf8').matchAll(EXPORTED_QUERY)].map((match) => match[1]);
}

function stylesheetQueries() {
  return readdirSync(SECTION_DIRECTORY)
    .filter((file) => file.endsWith('.css'))
    .flatMap((file) =>
      [...readFileSync(path.join(SECTION_DIRECTORY, file), 'utf8').matchAll(MEDIA_RULE)].flatMap((match) =>
        match[1].split(',').map((query) => `${file}: ${query.trim()}`),
      ),
    );
}

describe('web media queries', () => {
  it('reads the queries of both sides, so the comparison below has something to compare', () => {
    assert.ok(scriptQueries().length > 0);
    assert.ok(stylesheetQueries().length > 0);
  });

  it('lets the stylesheets use only the media queries media-queries.ts exports, so CSS and scripts switch layouts at one width', () => {
    const known = new Set(scriptQueries());

    assert.deepEqual(
      stylesheetQueries().filter((entry) => !known.has(entry.slice(entry.indexOf(': ') + 2))),
      [],
    );
  });
});
