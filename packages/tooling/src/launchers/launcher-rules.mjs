import { downloadingPackageRun } from './downloading-package-run.mjs';
import { nonLoopbackHostBind } from './non-loopback-host-bind.mjs';

const LAUNCHER_RULES = [downloadingPackageRun, nonLoopbackHostBind];

export function findLauncherViolations(text) {
  const violations = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const found = LAUNCHER_RULES.flatMap(({ name, find }) => find(line).map((offset) => ({ offset, rule: name })));
    for (const { offset, rule } of found.sort((left, right) => left.offset - right.offset)) {
      violations.push({ line: index + 1, column: offset + 1, rule, excerpt: line.trim() });
    }
  }
  return violations;
}

export function explainLauncherRule(name) {
  return LAUNCHER_RULES.find((rule) => rule.name === name).explanation;
}
