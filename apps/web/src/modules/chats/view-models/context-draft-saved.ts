import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';

import { type GenerationSettingsDraft, INHERIT_PRESET_VALUE } from '../mutations/use-auto-saved-generation-settings';

export function isContextDraftSaved(draft: GenerationSettingsDraft, saved: ChatGenerationSettingsDto): boolean {
  const savedContext = saved.sampling.maxContextLength === null ? '' : String(saved.sampling.maxContextLength);
  const savedPresetId = saved.samplerPresetId ?? INHERIT_PRESET_VALUE;

  return draft.sampling.maxContextLength.trim() === savedContext && draft.samplerPresetId === savedPresetId;
}
