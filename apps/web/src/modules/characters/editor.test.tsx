import type { CharacterDetailDto } from '@immersion/contracts/characters';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEditorDraftStore, type EditorDraftStore } from '../../shared/drafts/editor-draft-store';
import { createTestQueryClient } from '../../test-support/create-test-query-client';
import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { CharacterEditorScreen } from './editor';

const RESTORED_NOTICE = 'Восстановлен несохранённый черновик.';
const PENDING_AVATAR_HINT = 'Аватар загрузится вместе с карточкой.';

const CREATED_CHARACTER: CharacterDetailDto = {
  avatarUrl: null,
  createdAt: '2026-11-13T09:00:00.000Z',
  description: '',
  exampleDialogue: '',
  firstMessage: '',
  id: 'shkiper.json',
  name: 'Шкипер',
  personality: '',
  scenario: '',
  systemPrompt: '',
  tags: [],
  updatedAt: '2026-11-13T09:00:00.000Z',
};

interface CharacterServer {
  avatarUploads: number;
  creates: number;
}

function serveCharacters(): CharacterServer {
  const server: CharacterServer = { avatarUploads: 0, creates: 0 };
  stubFetch().mockImplementation((input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/api/characters') && method === 'POST') {
      server.creates += 1;
      return Promise.resolve(Response.json({ character: CREATED_CHARACTER }));
    }
    if (url.endsWith('/api/characters/shkiper.json/avatar') && method === 'PUT') {
      server.avatarUploads += 1;
      return Promise.resolve(Response.json({ character: { ...CREATED_CHARACTER, avatarUrl: '/avatars/shkiper.png' } }));
    }
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL(): string {
        return 'blob:avatar-preview';
      }
      static revokeObjectURL(): void {}
    },
  );
  return server;
}

async function openNewCharacter(editorDraftStore: EditorDraftStore) {
  return renderWithProviders(<CharacterEditorScreen characterId={null} />, {
    editorDraftStore,
    queryClient: createTestQueryClient(),
  });
}

function field(label: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(label);
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

function pickAvatar(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('The avatar file input is missing.');
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'shkiper.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('CharacterEditorScreen drafts', () => {
  it('brings back the name, the generation concept and the picked avatar of a new character', async () => {
    serveCharacters();
    const store = createEditorDraftStore();
    const first = await openNewCharacter(store);
    type('Концепт для генерации', 'угрюмый шкипер с севера');
    type('Имя *', 'Шкипер');
    pickAvatar(first.container);
    expect(screen.getByText(PENDING_AVATAR_HINT)).toBeDefined();
    first.unmount();

    await openNewCharacter(store);

    expect(field('Концепт для генерации').value).toBe('угрюмый шкипер с севера');
    expect(field('Имя *').value).toBe('Шкипер');
    expect(screen.getByText(PENDING_AVATAR_HINT)).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain(RESTORED_NOTICE);
  });

  it('keeps a draft that holds only the generation concept', async () => {
    serveCharacters();
    const store = createEditorDraftStore();
    const first = await openNewCharacter(store);
    type('Концепт для генерации', 'угрюмый шкипер с севера');
    first.unmount();

    await openNewCharacter(store);

    expect(field('Концепт для генерации').value).toBe('угрюмый шкипер с севера');
  });

  it('discards the concept, the fields and the picked avatar together', async () => {
    serveCharacters();
    const store = createEditorDraftStore();
    const first = await openNewCharacter(store);
    type('Концепт для генерации', 'угрюмый шкипер с севера');
    type('Имя *', 'Шкипер');
    pickAvatar(first.container);
    first.unmount();
    await openNewCharacter(store);

    fireEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));

    expect(field('Концепт для генерации').value).toBe('');
    expect(field('Имя *').value).toBe('');
    expect(screen.queryByText(PENDING_AVATAR_HINT)).toBeNull();
    expect(store.read('character', null)).toBeNull();
  });

  it('starts the next new character empty once this one is created with its avatar', async () => {
    const server = serveCharacters();
    const store = createEditorDraftStore();
    const first = await openNewCharacter(store);
    type('Имя *', 'Шкипер');
    pickAvatar(first.container);

    fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    await waitFor(() => expect(server.avatarUploads).toBe(1));
    await waitFor(() => expect(store.read('character', null)).toBeNull());
    first.unmount();
    await openNewCharacter(store);
    expect(field('Имя *').value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(server.creates).toBe(1);
  });
});
