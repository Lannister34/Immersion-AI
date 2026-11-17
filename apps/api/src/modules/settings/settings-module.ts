import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { FastifyPluginAsync } from 'fastify';

import { type ActiveSamplerPreset, resolveSamplerPresetForModel } from './application/active-sampler-preset.js';
import { getProfileUserName } from './application/get-profile-user-name.js';
import { getSettingsOverview } from './application/get-settings-overview.js';
import { createSettingsRoutes, type SettingsRoutesDependencies } from './interface/http/routes.js';

export type SettingsModuleDependencies = SettingsRoutesDependencies;

export interface SettingsModule {
  readonly routes: FastifyPluginAsync;
  getSettingsOverview(): SettingsOverviewResponse;
  getProfileUserName(): string;
  findSamplerPreset(presetId: string): ActiveSamplerPreset | null;
  resolveSamplerPresetForModel(modelName: string | null): ActiveSamplerPreset;
}

export function createSettingsModule(dependencies: SettingsModuleDependencies): SettingsModule {
  return {
    routes: createSettingsRoutes(dependencies),
    getSettingsOverview: () => getSettingsOverview(dependencies),
    getProfileUserName: () => getProfileUserName(dependencies),
    findSamplerPreset: (presetId) =>
      getSettingsOverview(dependencies).sampler.presets.find((preset) => preset.id === presetId) ?? null,
    resolveSamplerPresetForModel: (modelName) =>
      resolveSamplerPresetForModel(getSettingsOverview(dependencies), modelName),
  };
}
