import { ApiProblemSchema } from '@immersion/contracts/common';
import { UpdateSettingsProfileCommandSchema } from '@immersion/contracts/settings';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';

import { getSettingsOverview } from '../../application/get-settings-overview.js';
import { updateSettingsProfile } from '../../application/update-settings-profile.js';

function toProblem(error: unknown) {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiProblemSchema.parse({
        code: 'validation_error',
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      }),
    };
  }

  return {
    statusCode: 500,
    body: ApiProblemSchema.parse({
      code: 'internal_error',
      message: 'Unexpected error.',
    }),
  };
}

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getSettingsOverview());

  app.put('/profile', async (request, reply) => {
    try {
      const command = UpdateSettingsProfileCommandSchema.parse(request.body);
      return await updateSettingsProfile(command);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update settings profile');
      const problem = toProblem(error);
      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
