import type { ChatGenerationSettingsDto } from '@immersion/contracts/chats';
import type { SettingsOverviewResponse } from '@immersion/contracts/settings';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { ChatRightPanelTab } from '../../../app/store/ui-shell';
import { XIcon } from '../../../shared/ui/icons';
import { useAutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import type { InheritedSampling } from '../view-models/sampling-overrides';
import { ContextTab } from './context-tab';
import { MarkDot } from './mark-dot';
import { ModelTab } from './model-tab';

export interface RightPanelProps {
  /** Системный промпт, который backend собрал для этого чата. */
  assembledPrompt: string | undefined;
  characterAvatarUrl: string | null;
  characterId: string | null;
  characterName: string | null;
  chatId: string;
  effectiveSampling?: InheritedSampling | undefined;
  generationSettings: ChatGenerationSettingsDto;
  lorebookIds: string[];
  modelBindingPresetId: string | null;
  onClose: () => void;
  onResizeStart: (event: ReactPointerEvent<HTMLElement>) => void;
  onTabChange: (tab: ChatRightPanelTab) => void;
  scenarioName: string | null;
  settingsOverview?: SettingsOverviewResponse | undefined;
  tab: ChatRightPanelTab;
}

const TABS: { id: ChatRightPanelTab; label: string }[] = [
  { id: 'model', label: 'Модель' },
  { id: 'context', label: 'Контекст' },
];

export function RightPanel({
  assembledPrompt,
  characterAvatarUrl,
  characterId,
  characterName,
  chatId,
  effectiveSampling,
  generationSettings,
  lorebookIds,
  modelBindingPresetId,
  onClose,
  onResizeStart,
  onTabChange,
  scenarioName,
  settingsOverview,
  tab,
}: RightPanelProps) {
  // Черновик один на панель: обе вкладки правят одну и ту же настройку чата
  // и сохраняются одним запросом.
  const form = useAutoSavedGenerationSettings(chatId, generationSettings);
  const hasContextOverride =
    form.draft.systemPrompt.trim().length > 0 || form.draft.additionalInstructions.trim().length > 0;

  return (
    <aside className="rp">
      <div className="rp__head">
        <strong style={{ fontSize: 'var(--fz-md)' }}>Настройки чата</strong>
        <div className="row gap-4" style={{ alignItems: 'center' }}>
          <span
            aria-hidden="true"
            className="rp__resize"
            onPointerDown={onResizeStart}
            title="Потянуть, чтобы изменить ширину"
          >
            <span />
            <span />
          </span>
          <button className="btn btn--icon" onClick={onClose} title="Скрыть панель" type="button">
            <XIcon size={14} />
          </button>
        </div>
      </div>
      <div className="rp__tabs">
        {TABS.map((item) => (
          <button
            className="rp__tab"
            data-active={tab === item.id ? 'true' : 'false'}
            key={item.id}
            onClick={() => onTabChange(item.id)}
            type="button"
          >
            {item.label}
            {item.id === 'context' && hasContextOverride ? <MarkDot title="В этом чате есть свой текст" /> : null}
          </button>
        ))}
      </div>
      <div className="rp__body">
        {tab === 'model' ? (
          <ModelTab
            effectiveSampling={effectiveSampling}
            form={form}
            modelBindingPresetId={modelBindingPresetId}
            settings={settingsOverview}
          />
        ) : (
          <ContextTab
            assembledPrompt={assembledPrompt}
            characterAvatarUrl={characterAvatarUrl}
            characterId={characterId}
            characterName={characterName}
            form={form}
            lorebookIds={lorebookIds}
            scenarioName={scenarioName}
          />
        )}
      </div>
    </aside>
  );
}
