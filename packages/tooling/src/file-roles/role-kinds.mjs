export const ROLE_KINDS_WHEN_PRIVATE = new Set(['class', 'component', 'hook', 'schema']);
export const ROLE_KINDS_WHEN_EXPORTED = new Set([...ROLE_KINDS_WHEN_PRIVATE, 'function']);
export const TYPE_KIND = 'type';
export const SIGNATURE_KINDS = new Set([...ROLE_KINDS_WHEN_EXPORTED, TYPE_KIND]);
