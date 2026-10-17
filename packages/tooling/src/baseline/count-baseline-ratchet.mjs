function exceededKeys(counts, allowed) {
  return Object.keys(counts).filter((key) => counts[key] > (allowed[key] ?? 0));
}

function sameCounts(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => (left[key] ?? 0) === (right[key] ?? 0));
}

export function compareWithBaseline(found, baseline) {
  const over = [];
  const stale = [];
  for (const [file, counts] of found) {
    const allowed = baseline.get(file) ?? null;
    const exceeded = counts === null ? [] : exceededKeys(counts, allowed ?? {});
    if (exceeded.length > 0) {
      over.push({ file, counts, allowed, exceeded });
    } else if (allowed !== null && !sameCounts(counts ?? {}, allowed)) {
      stale.push({ file, counts, allowed, scanned: true });
    }
  }
  for (const [file, allowed] of baseline) {
    if (!found.has(file)) stale.push({ file, counts: null, allowed, scanned: false });
  }
  return { over, stale };
}

export function lowerBaseline(found, baseline) {
  if (baseline === null) return new Map([...found].filter(([, counts]) => counts !== null));
  const lowered = new Map();
  for (const [file, allowed] of baseline) {
    const counts = found.get(file) ?? null;
    if (counts === null) continue;
    const kept = Object.entries(allowed)
      .map(([key, count]) => [key, Math.min(count, counts[key] ?? 0)])
      .filter(([, count]) => count > 0);
    if (kept.length > 0) lowered.set(file, Object.fromEntries(kept));
  }
  return lowered;
}
