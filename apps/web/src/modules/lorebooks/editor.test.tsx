import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createEditorDraftStore, type EditorDraftStore } from '../../shared/drafts/editor-draft-store';
import { createTestQueryClient } from '../../test-support/create-test-query-client';
import { renderWithProviders } from '../../test-support/render-with-providers';
import { stubFetch } from '../../test-support/stub-fetch';
import { LorebookEditorScreen } from './editor';

const RESTORED_NOTICE = 'Восстановлен несохранённый черновик.';
const NO_ENTRIES = 'Записей пока нет.';

async function openNewLorebook(editorDraftStore: EditorDraftStore) {
  stubFetch().mockImplementation(() => new Promise<Response>(() => {}));
  return renderWithProviders(<LorebookEditorScreen lorebookId={null} />, {
    editorDraftStore,
    queryClient: createTestQueryClient(),
  });
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(label);
}

function type(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } });
}

describe('LorebookEditorScreen drafts', () => {
  it('brings back the name, the added entries and the generation concept of a new lorebook', async () => {
    const store = createEditorDraftStore();
    const first = await openNewLorebook(store);
    type('Название *', 'Портовый город');
    type('Концепт для генерации', 'город на краю штормового моря');
    fireEvent.click(screen.getByRole('button', { name: /Добавить запись/ }));
    expect(screen.queryByText(NO_ENTRIES, { exact: false })).toBeNull();
    first.unmount();

    await openNewLorebook(store);

    expect(field('Название *').value).toBe('Портовый город');
    expect(field('Концепт для генерации').value).toBe('город на краю штормового моря');
    expect(screen.queryByText(NO_ENTRIES, { exact: false })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(RESTORED_NOTICE);
  });

  it('keeps a draft that holds only the generation concept, and discards it with the button', async () => {
    const store = createEditorDraftStore();
    const first = await openNewLorebook(store);
    type('Концепт для генерации', 'город на краю штормового моря');
    first.unmount();
    await openNewLorebook(store);
    expect(field('Концепт для генерации').value).toBe('город на краю штормового моря');

    fireEvent.click(screen.getByRole('button', { name: 'Отбросить черновик' }));

    expect(field('Концепт для генерации').value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
    expect(store.read('lorebook', null)).toBeNull();
  });
});
