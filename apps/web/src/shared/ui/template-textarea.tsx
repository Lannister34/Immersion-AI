import { useEffect, useRef } from 'react';

import { insertTemplatePlaceholder, splitTemplateText, TEMPLATE_PLACEHOLDERS } from '../lib/template-placeholders';

export interface TemplateTextareaProps {
  disabled?: boolean;
  id: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
}

/**
 * Textarea с подсветкой {{user}} и {{char}}: подложка повторяет текст теми же
 * метриками и рисует фон под плейсхолдерами, а сам ввод остаётся обычным
 * textarea — без contenteditable и без innerHTML.
 */
export function TemplateTextarea({
  disabled = false,
  id,
  maxLength,
  onChange,
  placeholder,
  rows = 4,
  value,
}: TemplateTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const pendingCaretRef = useRef<number | null>(null);

  useEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) {
      return;
    }

    pendingCaretRef.current = null;
    const element = textareaRef.current;
    element?.focus();
    // Позицию ограничиваем длиной значения: родитель мог обрезать текст по maxLength.
    const safeCaret = Math.min(caret, value.length);
    element?.setSelectionRange(safeCaret, safeCaret);
  }, [value]);

  const handleInsert = (token: string) => {
    const element = textareaRef.current;
    const selectionStart = element?.selectionStart ?? value.length;
    const selectionEnd = element?.selectionEnd ?? selectionStart;
    const result = insertTemplatePlaceholder(value, selectionStart, selectionEnd, token);

    pendingCaretRef.current = result.caret;
    onChange(result.value);
  };

  const syncScroll = () => {
    const element = textareaRef.current;
    const backdrop = backdropRef.current;
    if (element && backdrop) {
      backdrop.scrollTop = element.scrollTop;
      backdrop.scrollLeft = element.scrollLeft;
    }
  };

  return (
    <div className="col gap-4">
      <div className="tpl-field">
        <div aria-hidden="true" className="textarea tpl-field__backdrop" ref={backdropRef}>
          {splitTemplateText(value).map((segment, index) =>
            segment.isPlaceholder ? (
              <mark className="tpl-mark" key={`${index}-${segment.value}`}>
                {segment.value}
              </mark>
            ) : (
              <span key={`${index}-${segment.value}`}>{segment.value}</span>
            ),
          )}
          {/* Хвостовой перенос сохраняет высоту последней пустой строки. */}
          {'\n'}
        </div>
        <textarea
          className="textarea tpl-field__input"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.currentTarget.value)}
          onScroll={syncScroll}
          placeholder={placeholder}
          ref={textareaRef}
          rows={rows}
          value={value}
          {...(maxLength === undefined ? {} : { maxLength })}
        />
      </div>
      <div className="row gap-6" style={{ alignItems: 'center' }}>
        <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
          Вставить:
        </span>
        {TEMPLATE_PLACEHOLDERS.map((token) => (
          <button
            className="btn btn--xs mono"
            disabled={disabled}
            key={token}
            onClick={() => handleInsert(token)}
            title={token === '{{user}}' ? 'Имя пользователя из профиля' : 'Имя персонажа чата'}
            type="button"
          >
            {token}
          </button>
        ))}
      </div>
    </div>
  );
}
