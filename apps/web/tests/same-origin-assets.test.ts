import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { build, type Rollup } from 'vite';
import { describe, expect, it, vi } from 'vitest';

import { renderWebLoginPage } from '../dev-server/web-login-page.js';
import { findAbsoluteUrlsInScript, findCrossOriginUrls } from './find-cross-origin-urls.js';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

const URL_LITERALS_THAT_FETCH_NOTHING = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'https://json-schema.org/draft/2020-12/schema',
  'http://json-schema.org/draft-07/schema#',
  'http://json-schema.org/draft-04/schema#',
  'https://react.dev/errors/',
  'http://localhost',
  'http://127.0.0.1:4787',
  'http://127.0.0.1:5001',
]);

type ScanKind = 'binary' | 'css' | 'html' | 'script';

const SCAN_KIND_BY_EXTENSION: Readonly<Record<string, ScanKind>> = {
  '.css': 'css',
  '.gif': 'binary',
  '.html': 'html',
  '.ico': 'binary',
  '.jpeg': 'binary',
  '.jpg': 'binary',
  '.js': 'script',
  '.json': 'script',
  '.mjs': 'script',
  '.png': 'binary',
  '.svg': 'html',
  '.txt': 'script',
  '.webmanifest': 'script',
  '.webp': 'binary',
  '.woff': 'binary',
  '.woff2': 'binary',
};

function urlsToReview(fileName: string, text: string): string[] {
  const kind = SCAN_KIND_BY_EXTENSION[extname(fileName).toLowerCase()];
  if (kind === undefined) return [`no scan rule for the file type of ${fileName}`];
  if (kind === 'binary') return [];
  if (kind === 'script')
    return findAbsoluteUrlsInScript(text).filter((url) => !URL_LITERALS_THAT_FETCH_NOTHING.has(url));
  return findCrossOriginUrls(text, kind);
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function findingsByFile(files: readonly { name: string; text: string }[]): Record<string, string[]> {
  return Object.fromEntries(
    files
      .map((file): [string, string[]] => [file.name, urlsToReview(file.name, file.text)])
      .filter(([, urls]) => urls.length > 0),
  );
}

function textOf(source: string | Uint8Array): string {
  return typeof source === 'string' ? source : new TextDecoder().decode(source);
}

async function buildInMemory(): Promise<(Rollup.OutputAsset | Rollup.OutputChunk)[]> {
  vi.stubEnv('NODE_ENV', 'production');
  for (const name of Object.keys(process.env).filter((key) => key.startsWith('VITE_'))) vi.stubEnv(name, undefined);
  const result = await build({
    configFile: join(webRoot, 'vite.config.ts'),
    envDir: false,
    logLevel: 'silent',
    mode: 'production',
    root: webRoot,
    build: { write: false },
  });
  const outputs = Array.isArray(result) ? result : [result];

  return outputs.flatMap((output) => ('output' in output ? output.output : []));
}

describe('the web app requests nothing from another origin', () => {
  it('references no other host from index.html, the stylesheets or any public file', () => {
    const sources = [
      join(webRoot, 'index.html'),
      ...filesUnder(join(webRoot, 'src')).filter((path) => ['.css', '.html'].includes(extname(path))),
      ...filesUnder(join(webRoot, 'public')),
    ];

    expect(sources.filter((path) => path.endsWith('.css')).length).toBeGreaterThan(1);
    expect(
      findingsByFile(sources.map((path) => ({ name: relative(webRoot, path), text: readFileSync(path, 'utf8') }))),
    ).toEqual({});
  });

  it('references no other host from the login page the dev server serves', () => {
    expect(findCrossOriginUrls(renderWebLoginPage({ next: '/chat', error: 'Неверный пароль' }), 'html')).toEqual([]);
  });

  it('builds files that reference no other host, whatever VITE_ variables the shell holds', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://10.0.0.5:4787');

    const output = await buildInMemory();
    const files = output.map((item) => ({
      name: item.fileName,
      text: item.type === 'chunk' ? item.code : textOf(item.source),
    }));

    expect(files.map((file) => file.name)).toContain('index.html');
    expect(files.filter((file) => file.name.endsWith('.woff2'))).toHaveLength(4);
    expect(findingsByFile(files)).toEqual({});
  }, 120_000);
});
