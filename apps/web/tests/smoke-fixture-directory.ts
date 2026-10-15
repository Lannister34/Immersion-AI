import { fileURLToPath, URL } from 'node:url';

export const smokeFixtureDirectory = fileURLToPath(new URL('../../api/testdata/smoke-data', import.meta.url));
