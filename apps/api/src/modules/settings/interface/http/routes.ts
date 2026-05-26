import { ApiProblemSchema } from '@immersion/contracts/common';
import {
  CreateSamplerPresetCommandSchema,
  SetActiveSamplerPresetCommandSchema,
  UpdateSamplerPresetCommandSchema,
  UpdateSettingsProfileCommandSchema,
} from '@immersion/contracts/settings';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError, z } from 'zod';

import { getSettingsOverview } from '../../application/get-settings-overview.js';
import {
  createSamplerPreset,
  deleteSamplerPreset,
  LastSamplerPresetError,
  SamplerPresetNotFoundError,
  setActiveSamplerPreset,
  updateSamplerPreset,
} from '../../application/sampler-preset-mutations.js';
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

  if (error instanceof SamplerPresetNotFoundError) {
    return {
      statusCode: 404,
      body: ApiProblemSchema.parse({
        code: 'sampler_preset_not_found',
        message: error.message,
      }),
    };
  }

  if (error instanceof LastSamplerPresetError) {
    return {
      statusCode: 409,
      body: ApiProblemSchema.parse({
        code: 'last_sampler_preset',
        message: error.message,
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

const PresetRouteParamsSchema = z.object({
  presetId: z.string().trim().min(1),
});

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

  app.post('/sampler/presets', async (request, reply) => {
    try {
      const command = CreateSamplerPresetCommandSchema.parse(request.body);
      const response = await createSamplerPreset(command);
      return reply.status(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create sampler preset');
      const problem = toProblem(error);
      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.put('/sampler/presets/:presetId', async (request, reply) => {
    try {
      const { presetId } = PresetRouteParamsSchema.parse(request.params);
      const command = UpdateSamplerPresetCommandSchema.parse(request.body);
      return await updateSamplerPreset(presetId, command);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update sampler preset');
      const problem = toProblem(error);
      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.delete('/sampler/presets/:presetId', async (request, reply) => {
    try {
      const { presetId } = PresetRouteParamsSchema.parse(request.params);
      return await deleteSamplerPreset(presetId);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete sampler preset');
      const problem = toProblem(error);
      return reply.status(problem.statusCode).send(problem.body);
    }
  });

  app.put('/sampler/active-preset', async (request, reply) => {
    try {
      const command = SetActiveSamplerPresetCommandSchema.parse(request.body);
      return await setActiveSamplerPreset(command.presetId);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to set active sampler preset');
      const problem = toProblem(error);
      return reply.status(problem.statusCode).send(problem.body);
    }
  });
};
