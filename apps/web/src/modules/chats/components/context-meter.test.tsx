import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildChatReplyPromptPreview,
  type ChatReplyPromptPreviewFixture,
} from '../../../test-support/chat-reply-prompt-preview-fixture';
import { renderWithProviders } from '../../../test-support/render-with-providers';
import { toContextStats } from '../view-models/context-stats';
import { ContextMeter } from './context-meter';

const ONLY_LAST_MESSAGE = 'только последнее сообщение';

async function renderMeter(fixture: ChatReplyPromptPreviewFixture) {
  const stats = toContextStats(buildChatReplyPromptPreview(fixture));
  if (!stats) throw new Error('the preview fixture produced no context stats');

  return renderWithProviders(<ContextMeter stats={stats} />);
}

function rowText(label: string): string | null {
  return screen.getByText(label).parentElement?.textContent ?? null;
}

describe('ContextMeter', () => {
  it('shows without opening that only the last message fits when the reply limit reaches the context', async () => {
    await renderMeter({
      budgetStatus: 'reply-exceeds-context',
      maxContextLength: 32_768,
      maxTokens: 32_768,
      transcriptMessageCount: 1,
      trimmedMessageCount: 39,
    });

    expect(screen.getByText(ONLY_LAST_MESSAGE)).toBeTruthy();
  });

  it('lists the trimmed messages and the reply limit beside the context window', async () => {
    await renderMeter({
      budgetStatus: 'reply-exceeds-context',
      maxContextLength: 32_768,
      maxTokens: 32_768,
      transcriptMessageCount: 1,
      trimmedMessageCount: 39,
    });

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('обрезано сообщений')).toBe('обрезано сообщений39');
    expect(rowText('сообщений в промпте')).toBe('сообщений в промпте1');
    expect(rowText('лимит ответа')).toBe(`лимит ответа${(32_768).toLocaleString('ru-RU')}`);
    expect(rowText('окно контекста')).toBe(`окно контекста${(32_768).toLocaleString('ru-RU')}`);
  });

  it('counts trimmed messages without the warning when a valid budget only drops older history', async () => {
    await renderMeter({
      budgetStatus: 'trimmed',
      maxContextLength: 8192,
      maxTokens: 600,
      transcriptMessageCount: 12,
      trimmedMessageCount: 7,
    });

    expect(screen.queryByText(ONLY_LAST_MESSAGE)).toBeNull();

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('обрезано сообщений')).toBe('обрезано сообщений7');
  });

  it("measures against the built-in server's context and says so when the preset asks for a larger window", async () => {
    await renderMeter({
      budgetStatus: 'trimmed',
      contextWindow: { size: 8192, source: 'runtime' },
      maxContextLength: 32_256,
      maxTokens: 600,
      transcriptMessageCount: 12,
      trimmedMessageCount: 7,
    });

    const badge = screen.getByText('окно ограничено сервером');
    expect(badge.getAttribute('title')).toContain(`предустановка просит ${(32_256).toLocaleString('ru-RU')}`);
    expect(screen.getByTitle('Подробности о контексте').textContent).toContain(`/ ${(8192).toLocaleString('ru-RU')} ·`);

    fireEvent.click(screen.getByTitle('Подробности о контексте'));

    expect(rowText('окно контекста')).toBe(`окно контекста${(8192).toLocaleString('ru-RU')} (сервер)`);
  });

  it('shows no server limit while the preset window fits the server', async () => {
    await renderMeter({
      budgetStatus: 'fits',
      maxContextLength: 8192,
      maxTokens: 600,
      transcriptMessageCount: 3,
      trimmedMessageCount: 0,
    });

    expect(screen.queryByText('окно ограничено сервером')).toBeNull();
  });
});
