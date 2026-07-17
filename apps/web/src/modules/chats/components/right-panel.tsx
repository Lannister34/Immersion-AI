import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { ReactNode } from 'react';

import type { ChatRightPanelSection } from '../../../app/store/ui-shell';
import { BookIcon, ChevronRightIcon, EyeIcon, SlidersIcon, UserIcon, XIcon } from '../../../shared/ui/icons';
import type { ContextStats } from '../view-models/context-stats';
import { CharacterSectionContent } from './character-section';
import { ContextSectionContent } from './context-section';
import { GenerationSettingsSection } from './generation-settings-section';
import { LorebooksSectionContent } from './lorebooks-section';

export interface RightPanelProps {
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  chatId: string;
  contextStats?: ContextStats | undefined;
  generationSettings: ChatGenerationSettingsDto;
  lorebookIds: string[];
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
  generationSettings,
  lorebookIds,
  onSectionToggle,
  openSection,
  scenarioId,
  scenarioName,
  settingsOverview,
}: RightPanelProps) {
  const sections: { id: NonNullable<ChatRightPanelSection>; label: string; icon: ReactNode }[] = [
    { id: 'settings', label: 'Настройки генерации', icon: <SlidersIcon size={13} stroke="var(--muted)" /> },
    { id: 'character', label: 'Персонаж и сценарий', icon: <UserIcon size={13} stroke="var(--muted)" /> },
    { id: 'lorebooks', label: 'Лорбуки', icon: <BookIcon size={13} stroke="var(--muted)" /> },
    { id: 'context', label: 'Превью контекста', icon: <EyeIcon size={13} stroke="var(--muted)" /> },
  ];

  const renderSectionBody = (sectionId: NonNullable<ChatRightPanelSection>): ReactNode => {
    switch (sectionId) {
      case 'settings':
        return (
          <GenerationSettingsSection
            chatId={chatId}
            generationSettings={generationSettings}
            settings={settingsOverview}
          />
        );
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
        <button className="btn btn--icon" type="button">
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
