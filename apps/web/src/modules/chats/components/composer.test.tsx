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
      attachmentsUnavailableReason="Загруженная модель работает только с текстом."
      canAnswer={false}
      canAttachImages
      canContinue={false}
      canSend
      draftStats={undefined}
      isStreaming={false}
      isUploadingAttachment={false}
      onAnswer={ignore}
      onAttachFiles={ignore}
      onAttachmentsNotice={ignore}
      onCancel={ignore}
      onChange={ignore}
      onContinue={ignore}
      onKeyDown={ignore}
      onOpenContext={ignore}
      onOpenSettings={ignore}
      onRemoveAttachment={ignore}
      onSubmit={ignore}
      sendRefusal={null}
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
      clipboardData: { files: [image, new File(['x'], 'лоция.txt', { type: 'text/plain' })], types: ['Files'] },
    });

    expect(onAttachFiles).toHaveBeenCalledExactlyOnceWith([image]);
  });

  it('says why a pasted image is not attached instead of ignoring it', async () => {
    const onAttachFiles = vi.fn<ComposerProps['onAttachFiles']>();
    const onAttachmentsNotice = vi.fn<ComposerProps['onAttachmentsNotice']>();
    await renderComposer({ canAttachImages: false, onAttachFiles, onAttachmentsNotice });

    fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: { files: [new File(['x'], 'маяк.png', { type: 'image/png' })], types: ['Files'] },
    });

    expect(onAttachFiles).not.toHaveBeenCalled();
    expect(onAttachmentsNotice).toHaveBeenCalledExactlyOnceWith('Загруженная модель работает только с текстом.');
  });

  it('lets text pasted beside an image reach the textarea when the image cannot be attached', async () => {
    const onAttachmentsNotice = vi.fn<ComposerProps['onAttachmentsNotice']>();
    await renderComposer({ canAttachImages: false, onAttachmentsNotice });

    const pasted = fireEvent.paste(screen.getByRole('textbox'), {
      clipboardData: {
        files: [new File(['x'], 'ячейки.png', { type: 'image/png' })],
        types: ['text/plain', 'text/html', 'Files'],
      },
    });

    expect(pasted).toBe(true);
    expect(onAttachmentsNotice).toHaveBeenCalledExactlyOnceWith('Загруженная модель работает только с текстом.');
  });

  it('leaves a paste with no image to the textarea', async () => {
    const onAttachmentsNotice = vi.fn<ComposerProps['onAttachmentsNotice']>();
    await renderComposer({ canAttachImages: false, onAttachmentsNotice });

    const pasted = fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [] } });

    expect(pasted).toBe(true);
    expect(onAttachmentsNotice).not.toHaveBeenCalled();
  });

  it('shows why the draft cannot be sent', async () => {
    await renderComposer({ canSend: false, sendRefusal: 'Уберите изображения.' });

    expect(screen.getByRole('alert').textContent).toBe('Уберите изображения.');
  });

  it('marks an attached image whose file is gone and still lets it be removed', async () => {
    const onRemoveAttachment = vi.fn<ComposerProps['onRemoveAttachment']>();
    const { container } = await renderComposer({
      attachments: [{ id: 'missing.png', mimeType: 'image/png', url: '/api/chats/chat-1/attachments/missing.png' }],
      onRemoveAttachment,
    });

    const image = container.querySelector('.composer-thumb img');
    if (!image) throw new Error('the attached image is not shown');
    fireEvent.error(image);

    expect(screen.getByText('нет файла')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Убрать изображение'));
    expect(onRemoveAttachment).toHaveBeenCalledExactlyOnceWith('missing.png');
  });
});
