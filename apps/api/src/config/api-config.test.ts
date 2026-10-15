import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ApiConfigError, type ApiEnvironment, parseApiConfig } from './api-config.js';

const projectRoot = path.join(os.tmpdir(), 'Проекты', 'Immersion AI');

function issuesOf(env: ApiEnvironment): readonly string[] {
  try {
    parseApiConfig(env, projectRoot);
  } catch (error) {
    if (error instanceof ApiConfigError) {
      return error.issues;
    }

    throw error;
  }

  throw new Error('Expected parseApiConfig to reject the environment');
}

describe('parseApiConfig', () => {
  it('defaults to loopback, 4787, 4788 and <projectRoot>/data', () => {
    expect(parseApiConfig({}, projectRoot)).toEqual({
      host: '127.0.0.1',
      port: 4787,
      webPort: 4788,
      webOrigins: ['http://localhost:4788', 'http://127.0.0.1:4788'],
      projectRoot,
      dataRoot: path.join(projectRoot, 'data'),
      logLevel: 'info',
    });
  });

  it('treats a blank IMMERSION_API_HOST as unset, so an empty value binds loopback rather than every interface', () => {
    for (const host of ['', '   ', '\t\n']) {
      expect(parseApiConfig({ IMMERSION_API_HOST: host }, projectRoot).host).toBe('127.0.0.1');
    }
  });

  it('treats a blank or whitespace value of every key as unset', () => {
    const blankEnvironment = {
      IMMERSION_API_HOST: ' ',
      IMMERSION_API_PORT: '',
      IMMERSION_WEB_PORT: '  ',
      IMMERSION_WEB_ORIGINS: '\t',
      IMMERSION_DATA_ROOT: ' ',
      IMMERSION_LOG_LEVEL: '',
    };

    expect(parseApiConfig(blankEnvironment, projectRoot)).toEqual(parseApiConfig({}, projectRoot));
  });

  it('trims the values it reads', () => {
    const config = parseApiConfig(
      { IMMERSION_API_HOST: ' ::1 ', IMMERSION_API_PORT: ' 4799 ', IMMERSION_LOG_LEVEL: ' warn ' },
      projectRoot,
    );

    expect(config).toMatchObject({ host: '::1', port: 4799, logLevel: 'warn' });
  });

  it('rejects a port with trailing characters such as 4787abc', () => {
    for (const port of ['4787abc', '47 87', '4787.0', '-1', '+4787', '0x10', '1e3', '٤٧٨٧']) {
      expect(issuesOf({ IMMERSION_API_PORT: port })).toEqual([
        'IMMERSION_API_PORT: must be a whole number from 1 to 65535',
      ]);
    }
  });

  it('rejects ports 0 and 65536 and accepts 1 and 65535', () => {
    expect(issuesOf({ IMMERSION_API_PORT: '0' })).toEqual([
      'IMMERSION_API_PORT: must be a whole number from 1 to 65535',
    ]);
    expect(issuesOf({ IMMERSION_WEB_PORT: '65536' })).toEqual([
      'IMMERSION_WEB_PORT: must be a whole number from 1 to 65535',
    ]);
    expect(parseApiConfig({ IMMERSION_API_PORT: '1', IMMERSION_WEB_PORT: '65535' }, projectRoot)).toMatchObject({
      port: 1,
      webPort: 65_535,
    });
  });

  it('derives the default web origins from IMMERSION_WEB_PORT', () => {
    expect(parseApiConfig({ IMMERSION_WEB_PORT: '4173' }, projectRoot)).toMatchObject({
      webPort: 4173,
      webOrigins: ['http://localhost:4173', 'http://127.0.0.1:4173'],
    });
  });

  it('stores each web origin exactly as a browser sends it in the Origin header, since CORS compares strings', () => {
    expect(
      parseApiConfig(
        {
          IMMERSION_WEB_ORIGINS:
            'http://localhost:5173/,HTTP://LocalHost:5174,http://localhost:80,https://example.com:443,https://пример.example',
        },
        projectRoot,
      ).webOrigins,
    ).toEqual([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost',
      'https://example.com',
      'https://xn--e1afmkfd.example',
    ]);
    expect(parseApiConfig({ IMMERSION_WEB_PORT: '80' }, projectRoot).webOrigins).toEqual([
      'http://localhost',
      'http://127.0.0.1',
    ]);
  });

  it('parses a comma list of web origins and rejects one with a path', () => {
    expect(
      parseApiConfig(
        { IMMERSION_WEB_ORIGINS: ' http://localhost:5173 ,, https://xn--80ak6aa92e.example ,http://[::1]:4788' },
        projectRoot,
      ).webOrigins,
    ).toEqual(['http://localhost:5173', 'https://xn--80ak6aa92e.example', 'http://[::1]:4788']);

    expect(issuesOf({ IMMERSION_WEB_ORIGINS: 'http://localhost:4788,http://localhost:4788/chat' })).toEqual([
      'IMMERSION_WEB_ORIGINS: "http://localhost:4788/chat" is not an http(s) origin without a path',
    ]);
  });

  it('rejects a web origin that is not http(s), carries credentials, a query or a hash, or is no URL at all', () => {
    for (const origin of [
      'ftp://localhost:4788',
      'localhost:4788',
      'http://user@localhost:4788',
      'http://localhost:4788?x=1',
      'http://localhost:4788#chat',
      'not a url',
    ]) {
      expect(issuesOf({ IMMERSION_WEB_ORIGINS: origin })).toEqual([
        `IMMERSION_WEB_ORIGINS: "${origin}" is not an http(s) origin without a path`,
      ]);
    }
  });

  it('rejects a web origin list with no entries', () => {
    expect(issuesOf({ IMMERSION_WEB_ORIGINS: ' , ,' })).toEqual([
      'IMMERSION_WEB_ORIGINS: must list at least one origin',
    ]);
  });

  it('resolves a relative data root against the project root, not the working directory', () => {
    expect(parseApiConfig({ IMMERSION_DATA_ROOT: 'library/Мои чаты' }, projectRoot).dataRoot).toBe(
      path.join(projectRoot, 'library', 'Мои чаты'),
    );
    expect(parseApiConfig({ IMMERSION_DATA_ROOT: '../shared data' }, projectRoot).dataRoot).toBe(
      path.join(path.dirname(projectRoot), 'shared data'),
    );
  });

  it('keeps an absolute data root as given', () => {
    const absoluteDataRoot = path.join(os.tmpdir(), 'Данные Immersion');

    expect(parseApiConfig({ IMMERSION_DATA_ROOT: absoluteDataRoot }, projectRoot).dataRoot).toBe(absoluteDataRoot);
  });

  it('accepts every pino level and rejects an unknown log level, naming the key', () => {
    for (const level of ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']) {
      expect(parseApiConfig({ IMMERSION_LOG_LEVEL: level }, projectRoot).logLevel).toBe(level);
    }

    expect(issuesOf({ IMMERSION_LOG_LEVEL: 'verbose' })).toEqual([
      'IMMERSION_LOG_LEVEL: must be one of fatal, error, warn, info, debug, trace, silent',
    ]);
  });

  it('lists every invalid key in one error', () => {
    const environment = {
      IMMERSION_API_PORT: '4787abc',
      IMMERSION_WEB_PORT: '0',
      IMMERSION_WEB_ORIGINS: 'http://localhost:4788/chat',
      IMMERSION_LOG_LEVEL: 'verbose',
    };

    expect(issuesOf(environment).map((issue) => issue.slice(0, issue.indexOf(':')))).toEqual([
      'IMMERSION_API_PORT',
      'IMMERSION_WEB_PORT',
      'IMMERSION_WEB_ORIGINS',
      'IMMERSION_LOG_LEVEL',
    ]);
    expect(() => parseApiConfig(environment, projectRoot)).toThrow(
      /^Invalid API configuration:\n {2}IMMERSION_API_PORT: .+\n {2}IMMERSION_WEB_PORT: .+\n {2}IMMERSION_WEB_ORIGINS: .+\n {2}IMMERSION_LOG_LEVEL: .+$/u,
    );
  });

  it('accepts the environment PM2 passes today and ignores the keys it does not name', () => {
    const pm2DataRoot = path.join(os.tmpdir(), 'Immersion AI', 'data');

    expect(
      parseApiConfig(
        {
          NODE_ENV: 'development',
          IMMERSION_API_PORT: '4787',
          IMMERSION_WEB_PORT: '4788',
          IMMERSION_DATA_ROOT: pm2DataRoot,
          IMMERSION_SMOKE_DATA_ROOT: 'not read by the API',
          PM2_HOME: path.join(os.tmpdir(), '.pm2'),
          pm_id: '0',
        },
        projectRoot,
      ),
    ).toEqual({
      host: '127.0.0.1',
      port: 4787,
      webPort: 4788,
      webOrigins: ['http://localhost:4788', 'http://127.0.0.1:4788'],
      projectRoot,
      dataRoot: pm2DataRoot,
      logLevel: 'info',
    });
  });
});
