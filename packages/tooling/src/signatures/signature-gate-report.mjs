import { formatCounts } from '../baseline/count-baseline-format.mjs';
import { SIGNATURE_RULES } from './signature-rules.mjs';

function describeViolation(file, { line, column, rule, message }) {
  return `  ${file}:${line}:${column}: ${rule}: ${message}`;
}

export function describeOver({ file, counts, allowed, violations }, baselineLabel) {
  const limit = allowed === null ? 'none' : formatCounts(allowed);
  return [
    `${file}: ${formatCounts(counts)} where ${baselineLabel} allows ${limit}`,
    ...violations.map((violation) => describeViolation(file, violation)),
  ];
}

export function describeStale({ file, counts, allowed, scanned }, baselineLabel, updateCommand) {
  let now = 'no gated file';
  if (counts !== null) now = formatCounts(counts);
  else if (scanned) now = 'no violation';
  return [`${file}: ${now} where ${baselineLabel} still allows ${formatCounts(allowed)}; run ${updateCommand}`];
}

export function describeRules(ruleIds, baselineLabel) {
  return [
    ...SIGNATURE_RULES.filter(({ id }) => ruleIds.has(id)).map(({ id, statement }) => `${id}: ${statement}`),
    `${baselineLabel} only shrinks; the owner alone records an exception in it.`,
  ];
}
