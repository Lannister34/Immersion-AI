import type { AutoSavedGenerationSettings } from '../mutations/use-auto-saved-generation-settings';
import { ChatBindings, type ChatBindingsProps } from './chat-bindings';
import { FinalPromptSection } from './final-prompt-section';
import { MarkDot } from './mark-dot';
import { SaveErrorLine } from './save-error-line';

export interface ContextTabProps extends ChatBindingsProps {
  assembledPrompt: string | undefined;
  form: AutoSavedGenerationSettings;
}

export function ContextTab({
  assembledPrompt,
  characterAvatarUrl,
  characterId,
  characterName,
  form,
  lorebookIds,
  scenarioName,
}: ContextTabProps) {
  const hasInstructions = form.draft.additionalInstructions.trim().length > 0;
  const isManualPrompt = form.draft.systemPrompt.trim().length > 0;

  return (
    <div className="col gap-16" style={{ padding: 14 }}>
      <ChatBindings
        characterAvatarUrl={characterAvatarUrl}
        characterId={characterId}
        characterName={characterName}
        lorebookIds={lorebookIds}
        scenarioName={scenarioName}
      />

      <div className="col gap-6">
        <label className="row gap-6" htmlFor="chat-additional-instructions" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--fz-sm)', fontWeight: 600 }}>Дополнительные инструкции</span>
          {hasInstructions ? <MarkDot title="Заданы для этого чата" /> : null}
        </label>
        <span className="muted" style={{ fontSize: 'var(--fz-2xs)', lineHeight: 1.5 }}>
          Добавляются к промпту в конце — не заменяют ни персонажа, ни сценарий.
        </span>
        <textarea
          className="textarea"
          id="chat-additional-instructions"
          maxLength={20_000}
          onChange={(event) => {
            const { value } = event.currentTarget;
            form.setAdditionalInstructions(value);
          }}
          placeholder="Например: усилить описания насилия, дракон отвечает коротко и без вежливости."
          rows={4}
          style={{ fontSize: 'var(--fz-xs)', lineHeight: 1.5, minHeight: 74 }}
          value={form.draft.additionalInstructions}
        />
        {hasInstructions && isManualPrompt ? (
          <span style={{ color: 'var(--warn)', fontSize: 'var(--fz-2xs)' }}>
            Сейчас не применяются: промпт переопределён вручную.
          </span>
        ) : null}
      </div>

      <FinalPromptSection assembledPrompt={assembledPrompt} form={form} />
      <SaveErrorLine saveError={form.saveError} />
    </div>
  );
}
