import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AttachmentViewer } from './attachment-viewer';

describe('AttachmentViewer', () => {
  it('shows the attachment inside the app, with no link that would open a new tab', () => {
    render(<AttachmentViewer onClose={vi.fn()} url="/api/chats/c1/attachments/a1" />);

    expect(screen.getByRole('dialog', { name: 'Просмотр вложения' })).toBeDefined();
    expect(screen.getByRole<HTMLImageElement>('img').src).toContain('/api/chats/c1/attachments/a1');
    expect(document.querySelector('a[target="_blank"]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть просмотр' }));
  });

  it('closes on the backdrop and on Escape', () => {
    const onClose = vi.fn();
    render(<AttachmentViewer onClose={onClose} url="/api/chats/c1/attachments/a1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть просмотр' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
