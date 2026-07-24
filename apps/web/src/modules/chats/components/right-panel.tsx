import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { ReactNode } from 'react';

import type { ChatRightPanelSection } from '../../../app/store/ui-shell';
import { BookIcon, ChevronRightIcon, CpuIcon, EyeIcon, SlidersIcon, UserIcon, XIcon } from '../../../shared/ui/icons';
import { INHERIT_PRESET_VALUE, useAutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import type { ContextStats } from '../view-models/context-stats';
import { countSamplingOverrides, type InheritedSampling } from '../view-models/sampling-overrides';
import { CharacterSectionContent } from './character-section';
import { ContextSectionContent } from './context-section';
import { GenerationSettingsSection } from './generation-settings-section';
import { LorebooksSectionContent } from './lorebooks-section';
import { SamplerParamsSection } from './sampler-params-section';

export interface RightPanelProps {
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  chatId: string;
  contextStats?: ContextStats | undefined;
  effectiveSampling?: InheritedSampling | undefined;
  generationSettings: ChatGenerationSettingsDto;
  lorebookIds: string[];
  onClose: () => void;
  onSectionToggle: (section: ChatRightPanelSection) => void;
  openSection: ChatRightPanelSection;
  scenarioId: string | null;
  scenarioName: string | null;
  settingsOverview?: SettingsOverviewResponse | undefined;
}

export function RightPanel({
  characterAvatarUrl,
  characterId,
  characterName,
  chatId,
  contextStats,
  effectiveSampling,
  generationSettings,
  lorebookIds,
  onClose,
  onSectionToggle,
  openSection,
  scenarioId,
  scenarioName,
  settingsOverview,
}: RightPanelProps) {
  // Черновик один на панель: «Настройки генерации» и «Параметры модели» правят
  // одну и ту же настройку чата и сохраняются одним запросом.
  const generationSettingsForm = useAutoSavedGenerationSettings(chatId, generationSettings);
  const selectedPreset = settingsOverview?.sampler.presets.find(
    (preset) => preset.id === generationSettingsForm.draft.samplerPresetId,
  );
  // Подсказки берём у выбранного пресета, а при наследовании — у backend:
  // там уже учтены привязка модели и активный пресет.
  const inheritedSampling: InheritedSampling | undefined = selectedPreset ?? effectiveSampling;

  // Точка у названия секции: внутри есть значение, отличное от общих настроек.
  const hasChatSettingsOverride =
    generationSettingsForm.draft.samplerPresetId !== INHERIT_PRESET_VALUE ||
    generationSettingsForm.draft.systemPrompt.trim().length > 0;
  const hasSamplingOverride = countSamplingOverrides(generationSettingsForm.draft.sampling) > 0;

  const sections: {
    id: NonNullable<ChatRightPanelSection>;
    label: string;
    icon: ReactNode;
    overridden?: boolean;
  }[] = [
    {
      id: 'settings',
      label: 'Настройки генерации',
      icon: <SlidersIcon size={13} stroke="var(--muted)" />,
      overridden: hasChatSettingsOverride,
    },
    {
      id: 'sampler',
      label: 'Параметры модели',
      icon: <CpuIcon size={13} stroke="var(--muted)" />,
      overridden: hasSamplingOverride,
    },
    { id: 'character', label: 'Персонаж и сценарий', icon: <UserIcon size={13} stroke="var(--muted)" /> },
    { id: 'lorebooks', label: 'Лорбуки', icon: <BookIcon size={13} stroke="var(--muted)" /> },
    { id: 'context', label: 'Превью контекста', icon: <EyeIcon size={13} stroke="var(--muted)" /> },
  ];

  const renderSectionBody = (sectionId: NonNullable<ChatRightPanelSection>): ReactNode => {
    switch (sectionId) {
      case 'settings':
        return <GenerationSettingsSection form={generationSettingsForm} settings={settingsOverview} />;
      case 'sampler':
        return <SamplerParamsSection form={generationSettingsForm} inherited={inheritedSampling} />;
      case 'character':
        return (
          <CharacterSectionContent
            chatId={chatId}
            characterAvatarUrl={characterAvatarUrl}
            characterId={characterId}
            characterName={characterName}
            scenarioId={scenarioId}
            scenarioName={scenarioName}
          />
        );
      case 'lorebooks':
        return <LorebooksSectionContent chatId={chatId} lorebookIds={lorebookIds} />;
      case 'context':
        return <ContextSectionContent stats={contextStats} />;
    }
  };

  return (
    <aside className="rp">
      <div className="rp__head">
        <strong style={{ fontSize: 'var(--fz-md)' }}>Контекст чата</strong>
        <button className="btn btn--icon" onClick={onClose} title="Скрыть панель" type="button">
          <XIcon size={14} />
        </button>
      </div>
      <div className="rp__body">
        {sections.map((section) => {
          const isOpen = openSection === section.id;
          return (
            <div className="rp__section" data-open={isOpen ? 'true' : 'false'} key={section.id}>
              <button className="rp__section-toggle" onClick={() => onSectionToggle(section.id)} type="button">
                {section.icon}
                <span style={{ flex: 1, textAlign: 'left' }}>{section.label}</span>
                {section.overridden ? (
                  <span
                    style={{ background: 'var(--accent)', borderRadius: '50%', height: 6, width: 6 }}
                    title="В этом чате есть свои значения"
                  />
                ) : null}
                <ChevronRightIcon className="chevron" size={12} />
              </button>
              {isOpen ? <div className="rp__section-body">{renderSectionBody(section.id)}</div> : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
