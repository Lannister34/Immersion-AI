import { formatCounts } from '../baseline/count-baseline-format.mjs';

export function describeOver({ file, counts, allowed, members }, baselineLabel) {
  const limit = allowed === null ? 'none' : formatCounts(allowed);
  return [
    `${file}: role mix ${formatCounts(counts)} where ${baselineLabel} allows ${limit}`,
    ...members.map(
      ({ line, exported, kind, name }) => `  ${file}:${line}  ${exported ? 'exported ' : ''}${kind} ${name}`,
    ),
  ];
}

function currentState(counts, scanned) {
  if (counts !== null) return `role mix ${formatCounts(counts)}`;
  return scanned ? 'one role' : 'no gated file';
}

export function describeStale({ file, counts, allowed, scanned }, baselineLabel, updateCommand) {
  const now = currentState(counts, scanned);
  return [`${file}: ${now} where ${baselineLabel} still allows ${formatCounts(allowed)}; run ${updateCommand}`];
}

export function describeRule(baselineLabel) {
  return (
    'A file is one role: it exports one thing a reader can name, such as a class, a component, a hook, ' +
    'a use case, the schemas of one format or functions that compute one kind of thing, and holds nothing ' +
    'else but private glue only that thing uses. Move each other role into its own file. ' +
    `${baselineLabel} only shrinks; the owner alone records an exception in it.`
  );
}
