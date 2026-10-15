function exceeds(signature, allowed) {
  return Object.entries(signature).some(([kind, count]) => count > (allowed[kind] ?? 0));
}

function sameCounts(left, right) {
  const kinds = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...kinds].every((kind) => (left[kind] ?? 0) === (right[kind] ?? 0));
}

export function compareWithBaseline(found, baseline) {
  const over = [];
  const stale = [];
  for (const [file, signature] of found) {
    const allowed = baseline.get(file) ?? null;
    if (signature !== null && exceeds(signature, allowed ?? {})) {
      over.push({ file, signature, allowed });
    } else if (allowed !== null && !sameCounts(signature ?? {}, allowed)) {
      stale.push({ file, signature, allowed, scanned: true });
    }
  }
  for (const [file, allowed] of baseline) {
    if (!found.has(file)) stale.push({ file, signature: null, allowed, scanned: false });
  }
  return { over, stale };
}

export function lowerBaseline(found, baseline) {
  if (baseline === null) return new Map([...found].filter(([, signature]) => signature !== null));
  const lowered = new Map();
  for (const [file, allowed] of baseline) {
    const signature = found.get(file) ?? null;
    if (signature === null) continue;
    const kept = Object.entries(allowed)
      .map(([kind, count]) => [kind, Math.min(count, signature[kind] ?? 0)])
      .filter(([, count]) => count > 0);
    if (kept.length > 0) lowered.set(file, Object.fromEntries(kept));
  }
  return lowered;
}
