import { causeOf } from '../errors/cause-of.mjs';

const COUNT_PART = /^([a-z][a-z-]*):([1-9]\d*)$/;

function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

export function formatCounts(counts) {
  return Object.keys(counts)
    .sort(byCodeUnit)
    .map((key) => `${key}:${counts[key]}`)
    .join(' ');
}

export function parseCounts(text, keys) {
  const counts = {};
  for (const part of text.split(' ')) {
    const match = COUNT_PART.exec(part);
    if (match === null || !keys.has(match[1]) || match[1] in counts) return null;
    counts[match[1]] = Number(match[2]);
  }
  return counts;
}

export function countBaselineCodec({ keys, entry, example, GateError }) {
  return {
    parse(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new GateError(`is not valid JSON (${causeOf(error)})`);
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new GateError(`must map each file path to ${entry} such as "${example}"`);
      }
      const baseline = new Map();
      for (const [file, value] of Object.entries(parsed)) {
        const counts = typeof value === 'string' ? parseCounts(value, keys) : null;
        if (counts === null) {
          throw new GateError(`maps ${file} to ${JSON.stringify(value)}, which is not ${entry}`);
        }
        baseline.set(file, counts);
      }
      return baseline;
    },
    serialize(baseline) {
      const entries = [...baseline]
        .sort(([left], [right]) => byCodeUnit(left, right))
        .map(([file, counts]) => [file, formatCounts(counts)]);
      return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
    },
  };
}
