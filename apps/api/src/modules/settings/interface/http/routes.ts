import {
  CreateSamplerPresetCommandSchema,
  SetActiveSamplerPresetCommandSchema,
  UpdateSamplerPresetCommandSchema,
  UpdateSettingsProfileCommandSchema,
  UpsertModelBindingCommandSchema,
} from '@immersion/contracts/settings';
import type { FastifyPluginAsync } from 'fastify';

import { parseRequest } from '../../../../platform/http/parse-request.js';
import { getSettingsOverview } from '../../application/get-settings-overview.js';
import { deleteModelBinding, upsertModelBinding } from '../../application/model-binding-mutations.js';
import {
  createSamplerPreset,
  deleteSamplerPreset,
  setActiveSamplerPreset,
  updateSamplerPreset,
} from '../../application/sampler-preset-mutations.js';
import { updateSettingsProfile } from '../../application/update-settings-profile.js';
import { ModelBindingRouteParamsSchema, PresetRouteParamsSchema } from './request-schemas.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async () => getSettingsOverview());

  app.put('/profile', async (request) => {
    const command = parseRequest(UpdateSettingsProfileCommandSchema, request.body);

    return updateSettingsProfile(command);
  });

  app.post('/sampler/presets', async (request, reply) => {
    const command = parseRequest(CreateSamplerPresetCommandSchema, request.body);
    const response = await createSamplerPreset(command);

    return reply.status(201).send(response);
  });

  app.put('/sampler/presets/:presetId', async (request) => {
    const { presetId } = parseRequest(PresetRouteParamsSchema, request.params);
    const command = parseRequest(UpdateSamplerPresetCommandSchema, request.body);

    return updateSamplerPreset(presetId, command);
  });

  app.delete('/sampler/presets/:presetId', async (request) => {
    const { presetId } = parseRequest(PresetRouteParamsSchema, request.params);

    return deleteSamplerPreset(presetId);
  });

  app.put('/sampler/active-preset', async (request) => {
    const command = parseRequest(SetActiveSamplerPresetCommandSchema, request.body);

    return setActiveSamplerPreset(command.presetId);
  });

  app.put('/sampler/bindings/:modelName', async (request) => {
    const { modelName } = parseRequest(ModelBindingRouteParamsSchema, request.params);
    const command = parseRequest(UpsertModelBindingCommandSchema, request.body);

    return upsertModelBinding(modelName, command.presetId);
  });

  app.delete('/sampler/bindings/:modelName', async (request) => {
    const { modelName } = parseRequest(ModelBindingRouteParamsSchema, request.params);

    return deleteModelBinding(modelName);
  });
};
