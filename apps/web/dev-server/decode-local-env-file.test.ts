import { describe, expect, it } from 'vitest';

import { decodeLocalEnvFile } from './decode-local-env-file.js';
import { DevServerConfigError } from './dev-server-config.js';

const FILE = '.env.local';

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function issuesOf(bytes: Uint8Array): readonly string[] {
  try {
    decodeLocalEnvFile(bytes, FILE);
  } catch (error) {
    if (error instanceof DevServerConfigError) return error.issues;
    throw error;
  }

  return [];
}

describe('decodeLocalEnvFile', () => {
  it('reads the keys of a plain UTF-8 file, comments and other tools keys included', () => {
    expect(decodeLocalEnvFile(utf8('# LAN\nIMMERSION_WEB_LAN=1\nVITE_API_BASE_URL=\n'), FILE)).toEqual({
      IMMERSION_WEB_LAN: '1',
      VITE_API_BASE_URL: '',
    });
  });

  it('reads a file that Notepad saved with a UTF-8 byte order mark, which parseEnv folds into the first key', () => {
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('IMMERSION_WEB_LAN=1\r\n')]);

    expect(decodeLocalEnvFile(withBom, FILE)).toEqual({ IMMERSION_WEB_LAN: '1' });
  });

  it('refuses a UTF-16 file, which Windows PowerShell 5.1 writes with >, instead of reading no keys from it', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from('IMMERSION_WEB_LAN=1', 'utf16le')]);

    expect(issuesOf(utf16)).toEqual(['.env.local: is UTF-16; save it as UTF-8']);
  });

  it('refuses a file in a legacy code page, naming the file, instead of a bare decoding error', () => {
    const windows1251Comment = new Uint8Array([0x23, 0x20, 0xcb, 0xc0, 0xcd, 0x0a, ...utf8('IMMERSION_WEB_LAN=1')]);

    expect(issuesOf(windows1251Comment)).toEqual(['.env.local: is not UTF-8; save it as UTF-8']);
  });

  it('refuses a misspelt dev server key instead of ignoring the opt-in it was meant to be', () => {
    expect(issuesOf(utf8('IMMERSION_WEB_LAM=1\n'))).toEqual([
      '.env.local: IMMERSION_WEB_LAM is not a dev server setting',
    ]);
  });
});
