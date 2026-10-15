import { formatSignature } from './role-baseline-format.mjs';

export function describeOver({ file, signature, allowed, members }, baselineLabel) {
  const limit = allowed === null ? 'none' : formatSignature(allowed);
  return [
    `${file}: role mix ${formatSignature(signature)} where ${baselineLabel} allows ${limit}`,
    ...members.map(
      ({ line, exported, kind, name }) => `  ${file}:${line}  ${exported ? 'exported ' : ''}${kind} ${name}`,
    ),
  ];
}

function currentState(signature, scanned) {
  if (signature !== null) return `role mix ${formatSignature(signature)}`;
  return scanned ? 'one role' : 'no gated file';
}

export function describeStale({ file, signature, allowed, scanned }, baselineLabel, updateCommand) {
  const now = currentState(signature, scanned);
  return [`${file}: ${now} where ${baselineLabel} still allows ${formatSignature(allowed)}; run ${updateCommand}`];
}

export function describeRule(baselineLabel) {
  return (
    'A file is one role: it exports one thing a reader can name, such as a class, a component, a hook, ' +
    'a use case, the schemas of one format or functions that compute one kind of thing, and holds nothing ' +
    'else but private glue only that thing uses. Move each other role into its own file. ' +
    `${baselineLabel} only shrinks; the owner alone records an exception in it.`
  );
}
