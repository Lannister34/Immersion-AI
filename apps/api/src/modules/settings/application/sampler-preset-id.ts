import { randomUUID } from 'node:crypto';

const COMBINING_DIACRITICS = /[\u0300-\u036f]/gu;

function slugifyName(name: string): string {
  const ascii = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^\da-z]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return ascii.length > 0 ? ascii.slice(0, 48) : '';
}

export function generateUniquePresetId(name: string, existingIds: ReadonlySet<string>): string {
  const base = slugifyName(name);
  if (base && !existingIds.has(base)) {
    return base;
  }

  if (base) {
    for (let suffix = 2; suffix < 1000; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!existingIds.has(candidate)) {
        return candidate;
      }
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `preset-${randomUUID().slice(0, 8)}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  throw new Error('Failed to generate a unique sampler preset id.');
}
