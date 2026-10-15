import { ROLE_KINDS_WHEN_EXPORTED, ROLE_KINDS_WHEN_PRIVATE, TYPE_KIND } from './role-kinds.mjs';

const SINGLE_THING_KINDS = new Set(['class', 'component']);

function connectedNames(declarations, starts) {
  const neighbours = new Map(declarations.map(({ name }) => [name, new Set()]));
  for (const { name, references } of declarations) {
    for (const reference of references) {
      neighbours.get(name)?.add(reference);
      neighbours.get(reference)?.add(name);
    }
  }
  const reached = new Set(starts);
  const pending = [...starts];
  while (pending.length > 0) {
    for (const next of neighbours.get(pending.pop()) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        pending.push(next);
      }
    }
  }
  return reached;
}

function detachedTypes(declarations) {
  const values = declarations.filter(({ kind, exported }) => exported && kind !== TYPE_KIND).map(({ name }) => name);
  if (values.length === 0) return new Set();
  const attached = connectedNames(declarations, values);
  return new Set(
    declarations.filter(({ kind, exported, name }) => exported && kind === TYPE_KIND && !attached.has(name)),
  );
}

export function roleMix(declarations) {
  const detached = detachedTypes(declarations);
  const members = declarations.filter(
    (declaration) =>
      detached.has(declaration) ||
      (declaration.exported ? ROLE_KINDS_WHEN_EXPORTED : ROLE_KINDS_WHEN_PRIVATE).has(declaration.kind),
  );
  const signature = {};
  for (const { kind } of members) signature[kind] = (signature[kind] ?? 0) + 1;
  const kinds = Object.keys(signature);
  const mixed = kinds.length > 1 || kinds.some((kind) => SINGLE_THING_KINDS.has(kind) && signature[kind] > 1);
  return mixed ? { signature, members } : null;
}
