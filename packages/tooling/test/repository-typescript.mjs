import { createRequire } from 'node:module';
import path from 'node:path';

import { REPOSITORY } from './repository-git.mjs';

export const typescript = createRequire(path.join(REPOSITORY, 'package.json'))('typescript');
