import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));
const FILE_ROLE_GATE = 'packages/tooling/src/file-roles/check-file-roles.mjs';

function lintSteps() {
  const manifest = JSON.parse(readFileSync(path.join(REPOSITORY, 'package.json'), 'utf8'));
  return manifest.scripts.lint.split('&&').map((step) => step.trim());
}

describe('lint script', () => {
  it('runs the comment gate and the file-role gate as steps whose failure fails lint', () => {
    const steps = lintSteps();

    assert.ok(steps.includes('devkit-comments'), `lint steps: ${steps.join(' | ')}`);
    assert.ok(steps.includes(`node ${FILE_ROLE_GATE}`), `lint steps: ${steps.join(' | ')}`);
    assert.ok(existsSync(path.join(REPOSITORY, FILE_ROLE_GATE)));
  });
});
