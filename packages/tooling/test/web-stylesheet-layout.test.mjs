import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { REPOSITORY } from './repository-git.mjs';

const WEB_SOURCES = path.join(REPOSITORY, 'apps/web/src');
const STYLESHEET_ENTRY = path.join(WEB_SOURCES, 'styles.css');
const SECTION_DIRECTORY = path.join(WEB_SOURCES, 'styles');
const SECTION_IMPORT = /^@import "\.\/styles\/([a-z]+(?:-[a-z]+)*\.css)";$/;

function entryLines() {
  return readFileSync(STYLESHEET_ENTRY, 'utf8').trimEnd().split(/\r?\n/);
}

function importedSections() {
  return entryLines().map((line) => SECTION_IMPORT.exec(line)?.[1] ?? null);
}

describe('web stylesheet layout', () => {
  it('keeps the stylesheet entry to one import per line of a section file in styles/', () => {
    const strayLines = entryLines().filter((line) => !SECTION_IMPORT.test(line));

    assert.deepEqual(strayLines, []);
  });

  it('imports each section file once', () => {
    const sections = importedSections();

    assert.deepEqual(
      sections.filter((section, index) => sections.indexOf(section) !== index),
      [],
    );
  });

  it('imports every section file in styles/, so no section is left out of the cascade', () => {
    const imported = new Set(importedSections());
    const sectionFiles = readdirSync(SECTION_DIRECTORY).filter((file) => file.endsWith('.css'));

    assert.notDeepEqual(sectionFiles, []);
    assert.deepEqual(
      sectionFiles.filter((file) => !imported.has(file)),
      [],
    );
  });
});
