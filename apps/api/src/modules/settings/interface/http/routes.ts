import {
  CreateSamplerPresetCommandSchema,
  SetActiveSamplerPresetCommandSchema,
  UpdateSamplerPresetCommandSchema,
  UpdateSettingsProfileCommandSchema,
  UpsertModelBindingCommandSchema,
} from '@immersion/contracts/settings';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createToProblem, problem } from '../../../../shared/interface/http/problem.js';
import { getSettingsOverview } from '../../application/get-settings-overview.js';
import {
  deleteModelBinding,
  ModelBindingNotFoundError,
  upsertModelBinding,
} from '../../application/model-binding-mutations.js';
import {
  createSamplerPreset,
  deleteSamplerPreset,
  LastSamplerPresetError,
  SamplerPresetNotFoundError,
  setActiveSamplerPreset,
  updateSamplerPreset,
} from '../../application/sampler-preset-mutations.js';
import { updateSettingsProfile } from '../../application/update-settings-profile.js';

const toProblem = createToProblem((error) => {
  if (error instanceof SamplerPresetNotFoundError) {
    return problem(404, 'sampler_preset_not_found', error.message);
  }

  if (error instanceof LastSamplerPresetError) {
    return problem(409, 'last_sampler_preset', error.message);
  }

  if (error instanceof ModelBindingNotFoundError) {
    return problem(404, 'model_binding_not_found', error.message);
  }

  return null;
});

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
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post('/sampler/presets', async (request, reply) => {
    try {
      const command = CreateSamplerPresetCommandSchema.parse(request.body);
      const response = await createSamplerPreset(command);
      return reply.status(201).send(response);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create sampler preset');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/sampler/presets/:presetId', async (request, reply) => {
    try {
      const { presetId } = PresetRouteParamsSchema.parse(request.params);
      const command = UpdateSamplerPresetCommandSchema.parse(request.body);
      return await updateSamplerPreset(presetId, command);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update sampler preset');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/sampler/presets/:presetId', async (request, reply) => {
    try {
      const { presetId } = PresetRouteParamsSchema.parse(request.params);
      return await deleteSamplerPreset(presetId);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete sampler preset');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.put('/sampler/active-preset', async (request, reply) => {
    try {
      const command = SetActiveSamplerPresetCommandSchema.parse(request.body);
      return await setActiveSamplerPreset(command.presetId);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to set active sampler preset');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  const ModelBindingRouteParamsSchema = z.object({
    modelName: z.string().trim().min(1),
  });

  app.put('/sampler/bindings/:modelName', async (request, reply) => {
    try {
      const { modelName } = ModelBindingRouteParamsSchema.parse(request.params);
      const command = UpsertModelBindingCommandSchema.parse(request.body);
      return await upsertModelBinding(modelName, command.presetId);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to upsert model binding');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete('/sampler/bindings/:modelName', async (request, reply) => {
    try {
      const { modelName } = ModelBindingRouteParamsSchema.parse(request.params);
      return await deleteModelBinding(modelName);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete model binding');
      const mapped = toProblem(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });
};
