import {
  type UpdateSettingsProfileCommand,
  UpdateSettingsProfileCommandSchema,
  type UpdateSettingsProfileResponse,
  UpdateSettingsProfileResponseSchema,
} from '@immersion/contracts/settings';

import { apiPut } from '../../../shared/api/client';

export function updateSettingsProfile(command: UpdateSettingsProfileCommand): Promise<UpdateSettingsProfileResponse> {
  return apiPut(
    '/api/settings/profile',
    command,
    UpdateSettingsProfileCommandSchema,
    UpdateSettingsProfileResponseSchema,
  );
}
