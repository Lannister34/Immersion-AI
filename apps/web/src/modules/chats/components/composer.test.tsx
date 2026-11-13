import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildChatReplyPromptPreview } from '../../../test-support/chat-reply-prompt-preview-fixture';
import { renderWithProviders } from '../../../test-support/render-with-providers';
import { type ContextStats, toContextStats } from '../view-models/context-stats';
import { Composer, type ComposerProps } from './composer';

const ignore = (): void => undefined;

function draftStatsOf(finalTotal: number): ContextStats {
  const stats = toContextStats(
    buildChatReplyPromptPreview({
      budgetStatus: 'fits',
      finalTotal,
      maxContextLength: 32_768,
      maxTokens: 512,
      transcriptMessageCount: 1,
      trimmedMessageCount: 0,
    }),
  );
  if (!stats) throw new Error('the preview fixture produced no context stats');
  return stats;
}

async function renderComposer(props: Partial<ComposerProps> = {}) {
  return renderWithProviders(
    <Composer
      attachments={[]}
      attachmentsError={null}
      attachmentsHint="Прикрепить изображение"
      attachmentsNotice={null}
      canAnswer={false}
      canAttachImages
      canContinue={false}
      canSend
      draftStats={undefined}
      isStreaming={false}
      isUploadingAttachment={false}
      onAnswer={ignore}
      onAttachFiles={ignore}
      onCancel={ignore}
      onChange={ignore}
      onContinue={ignore}
      onKeyDown={ignore}
      onOpenContext={ignore}
      onOpenSettings={ignore}
      onRemoveAttachment={ignore}
      onSubmit={ignore}
      sendHint={null}
      value="Держим курс на маяк"
      {...props}
    />,
  );
}

describe('Composer', () => {
  it('shows the draft estimate next to the character count', async () => {
    await renderComposer({ draftStats: draftStatsOf(1_250) });

    expect(screen.getByText('19 симв.')).toBeTruthy();
    const estimate = screen.getByText(/ток\. с черновиком/).textContent?.replace(/\s/g, ' ');
    expect(estimate).toBe('1 250 / 32 768 ток. с черновиком');
  });

  it('shows no draft estimate until one is known', async () => {
    await renderComposer();

    expect(screen.queryByText(/с черновиком/)).toBeNull();
  });

  it('shows a note about skipped files under the composer', async () => {
    await renderComposer({ attachmentsNotice: 'Прикрепить можно только изображения — остальные файлы пропущены.' });

    expect(screen.getByText('Прикрепить можно только изображения — остальные файлы пропущены.')).toBeTruthy();
  });

  it('attaches only the image files from a paste', async () => {
    const onAttachFiles = vi.fn<ComposerProps['onAttachFiles']>();
    await renderComposer({ onAttachFiles });
    const image = new File(['x'], 'маяк.png', { type: 'image/png' });

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { files: [image, new File(['x'], 'лоция.txt', { type: 'text/plain' })] },
    });

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith([image]);
  });
});
