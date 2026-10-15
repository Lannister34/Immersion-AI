import { RoleGateError } from './role-gate-error.mjs';
import { SIGNATURE_KINDS } from './role-kinds.mjs';

const SIGNATURE_PART = /^([a-z]+):([1-9]\d*)$/;

function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export function formatSignature(signature) {
  return Object.keys(signature)
    .sort(byCodeUnit)
    .map((kind) => `${kind}:${signature[kind]}`)
    .join(' ');
}

export function parseSignature(text) {
  const signature = {};
  for (const part of text.split(' ')) {
    const match = SIGNATURE_PART.exec(part);
    if (match === null || !SIGNATURE_KINDS.has(match[1]) || match[1] in signature) return null;
    signature[match[1]] = Number(match[2]);
  }
  return signature;
}

export function parseRoleBaseline(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new RoleGateError(`is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RoleGateError('must map file paths to role signatures such as "class:1 function:2"');
  }
  const baseline = new Map();
  for (const [file, value] of Object.entries(parsed)) {
    const signature = typeof value === 'string' ? parseSignature(value) : null;
    if (signature === null) {
      throw new RoleGateError(`maps ${file} to ${JSON.stringify(value)}, which is not a role signature`);
    }
    baseline.set(file, signature);
  }
  return baseline;
}

export function serializeRoleBaseline(baseline) {
  const entries = [...baseline]
    .sort(([left], [right]) => byCodeUnit(left, right))
    .map(([file, signature]) => [file, formatSignature(signature)]);
  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
}
