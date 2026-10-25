import { createSystemModule, type SystemModule } from '../modules/system/index.js';
import type { ApiDependencies } from './api-dependencies.js';

export interface ApiModules {
  readonly system: SystemModule;
}

export function createApiModules(dependencies: ApiDependencies): ApiModules {
  return {
    system: createSystemModule({ clock: dependencies.clock, webPort: dependencies.config.webPort }),
  };
}
