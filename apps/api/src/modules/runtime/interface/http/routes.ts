import {
  PickRuntimeDirectoryCommandSchema,
  PickRuntimeDirectoryResponseSchema,
  RuntimeConfigCommandSchema,
  RuntimeInstallCommandSchema,
  RuntimeStartCommandSchema,
} from '@immersion/contracts/runtime';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { getRuntimeLogs } from '../../application/get-runtime-logs.js';
import { getRuntimeOverview } from '../../application/get-runtime-overview.js';
import { installRuntime } from '../../application/install-runtime.js';
import { startRuntime } from '../../application/start-runtime.js';
import { stopRuntime } from '../../application/stop-runtime.js';
import { updateRuntimeConfig } from '../../application/update-runtime-config.js';
import { pickNativeDirectory } from '../../infrastructure/native-directory-picker.js';

export const runtimeRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getRuntimeOverview());

  app.get('/logs', async () => getRuntimeLogs());

  app.put('/config', async (request) => updateRuntimeConfig(parseRequest(RuntimeConfigCommandSchema, request.body)));

  app.post('/start', async (request) => startRuntime(parseRequest(RuntimeStartCommandSchema, request.body)));

  app.post('/pick-directory', async (request) => {
    const command = parseRequest(PickRuntimeDirectoryCommandSchema, request.body);
    const path = await pickNativeDirectory(command.initialPath ?? '');

    return PickRuntimeDirectoryResponseSchema.parse({ path });
  });

  app.post('/stop', async () => stopRuntime());

  app.post('/install', async (request) => installRuntime(parseRequest(RuntimeInstallCommandSchema, request.body)));
};
