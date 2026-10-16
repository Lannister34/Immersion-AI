export function describeViolation(file, { line, column, rule, excerpt }) {
  return `${file}:${line}:${column}: ${rule}: ${excerpt}`;
}
