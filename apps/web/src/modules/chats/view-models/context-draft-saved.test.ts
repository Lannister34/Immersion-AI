import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import { describe, expect, it } from 'vitest';

import type { GenerationSettingsDraft } from '../mutations/use-auto-saved-generation-settings';
import { isContextDraftSaved } from './context-draft-saved';
import { toSamplingDraft } from './sampling-overrides';

const SAVED: ChatGenerationSettingsDto = {
  additionalInstructions: null,
  samplerPresetId: null,
  sampling: {
    contextTrimStrategy: null,
    maxContextLength: 48_000,
    maxTokens: null,
    minP: null,
    presencePenalty: null,
    repeatPenalty: null,
    repeatPenaltyRange: null,
    temperature: null,
    topK: null,
    topP: null,
  },
  systemPrompt: null,
};

function draftOf(settings: ChatGenerationSettingsDto): GenerationSettingsDraft {
  return {
    additionalInstructions: settings.additionalInstructions ?? '',
    samplerPresetId: settings.samplerPresetId ?? '',
    sampling: toSamplingDraft(settings.sampling),
    systemPrompt: settings.systemPrompt ?? '',
  };
}

describe('isContextDraftSaved', () => {
  it('holds while the edited context and preset are the saved ones', () => {
    expect(isContextDraftSaved(draftOf(SAVED), SAVED)).toBe(true);
  });

  it('fails while an edited context, a cleared override or another preset is not saved yet', () => {
    const draft = draftOf(SAVED);

    expect(isContextDraftSaved({ ...draft, sampling: { ...draft.sampling, maxContextLength: '64000' } }, SAVED)).toBe(
      false,
    );
    expect(isContextDraftSaved({ ...draft, sampling: { ...draft.sampling, maxContextLength: '' } }, SAVED)).toBe(false);
    expect(isContextDraftSaved({ ...draft, samplerPresetId: 'artemis' }, SAVED)).toBe(false);
  });
});
