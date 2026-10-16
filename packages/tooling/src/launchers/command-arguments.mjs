const ARGUMENT = /[ \t]+([^\s"'`;&|()^]+)/y;

function argumentsAfter(line, from) {
  const found = [];
  ARGUMENT.lastIndex = from;
  for (let match = ARGUMENT.exec(line); match !== null; match = ARGUMENT.exec(line)) {
    found.push(match[1]);
  }
  return found;
}

export function readCommandArguments(line, from) {
  const found = argumentsAfter(line, from);
  const end = found.findIndex((argument) => argument === '--' || !argument.startsWith('-'));
  const options = end === -1 ? found : found.slice(0, end);
  const positionalAt = found[end] === '--' ? end + 1 : end;
  return { options, positional: end === -1 ? null : (found[positionalAt] ?? null) };
}
