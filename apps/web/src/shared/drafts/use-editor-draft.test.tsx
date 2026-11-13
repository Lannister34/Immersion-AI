import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderHookWithProviders } from '../../test-support/render-with-providers';
import { createEditorDraftStore, type EditorDraftStore } from './editor-draft-store';
import { type EditorDraftOptions, useEditorDraft } from './use-editor-draft';

interface Values {
  name: string;
}

const NEW_SCENARIO: EditorDraftOptions = { entityId: null, kind: 'scenario', savedVersion: null };
const SAVED_SCENARIO: EditorDraftOptions = {
  entityId: 'gavan-noch',
  kind: 'scenario',
  savedVersion: '2026-10-02T09:00:00.000Z',
};

function mountDraft(store: EditorDraftStore, options: EditorDraftOptions) {
  return renderHookWithProviders((props: EditorDraftOptions) => useEditorDraft<Values>(props), {
    editorDraftStore: store,
    initialProps: options,
  });
}

describe('useEditorDraft', () => {
  it('restores the values an earlier visit left unsaved and announces them', async () => {
    const store = createEditorDraftStore();
    const first = await mountDraft(store, NEW_SCENARIO);
    expect(first.result.current.restored).toBeNull();
    expect(first.result.current.notice).toBeNull();

    act(() => first.result.current.track({ name: 'Ночная гавань' }, false));
    first.unmount();
    const second = await mountDraft(store, NEW_SCENARIO);

    expect(second.result.current.restored).toEqual({ name: 'Ночная гавань' });
    expect(second.result.current.notice).toEqual({ conflict: false });
  });

  it('keeps drafts of different entities and kinds apart', async () => {
    const store = createEditorDraftStore();
    const first = await mountDraft(store, SAVED_SCENARIO);
    act(() => first.result.current.track({ name: 'Шхуна' }, false));
    first.unmount();

    const other = await mountDraft(store, { ...SAVED_SCENARIO, entityId: 'mayak' });
    const otherKind = await mountDraft(store, { ...SAVED_SCENARIO, kind: 'lorebook' });
    const fresh = await mountDraft(store, NEW_SCENARIO);

    expect(other.result.current.restored).toBeNull();
    expect(otherKind.result.current.restored).toBeNull();
    expect(fresh.result.current.restored).toBeNull();
  });

  it('drops the draft once the editor is back to the saved state', async () => {
    const store = createEditorDraftStore();
    const view = await mountDraft(store, SAVED_SCENARIO);

    act(() => view.result.current.track({ name: 'Шхуна' }, false));
    act(() => view.result.current.track({ name: 'Ночная гавань' }, true));

    expect(store.read('scenario', 'gavan-noch')).toBeNull();
  });

  it('hides the notice and forgets the draft when it is discarded', async () => {
    const store = createEditorDraftStore();
    store.write('scenario', null, { name: 'Шхуна' }, null);
    const view = await mountDraft(store, NEW_SCENARIO);

    act(() => view.result.current.discard());

    expect(view.result.current.notice).toBeNull();
    expect(store.read('scenario', null)).toBeNull();
  });

  it('starts the next new entity empty after a save, whatever the editor reports afterwards', async () => {
    const store = createEditorDraftStore();
    const view = await mountDraft(store, NEW_SCENARIO);
    act(() => view.result.current.track({ name: 'Шхуна' }, false));

    act(() => view.result.current.markSaved());
    act(() => view.result.current.track({ name: 'Шхуна' }, false));

    expect(store.read('scenario', null)).toBeNull();
    expect(view.result.current.notice).toBeNull();
  });

  it('keeps tracking an existing entity after a save, so later edits survive leaving', async () => {
    const store = createEditorDraftStore();
    const view = await mountDraft(store, SAVED_SCENARIO);
    act(() => view.result.current.track({ name: 'Шхуна' }, false));

    act(() => view.result.current.markSaved());
    expect(store.read('scenario', 'gavan-noch')).toBeNull();
    act(() => view.result.current.track({ name: 'Бриг' }, false));

    expect(store.read('scenario', 'gavan-noch')?.values).toEqual({ name: 'Бриг' });
  });

  it('stops tracking once the entity is deleted', async () => {
    const store = createEditorDraftStore();
    const view = await mountDraft(store, SAVED_SCENARIO);

    act(() => view.result.current.close());
    act(() => view.result.current.track({ name: 'Шхуна' }, false));

    expect(store.read('scenario', 'gavan-noch')).toBeNull();
  });

  it('warns when the saved version changed after the draft was started', async () => {
    const store = createEditorDraftStore();
    const first = await mountDraft(store, SAVED_SCENARIO);
    act(() => first.result.current.track({ name: 'Шхуна' }, false));
    first.rerender({ ...SAVED_SCENARIO, savedVersion: '2026-10-03T09:00:00.000Z' });
    act(() => first.result.current.track({ name: 'Бриг' }, false));
    first.unmount();

    const second = await mountDraft(store, { ...SAVED_SCENARIO, savedVersion: '2026-10-03T09:00:00.000Z' });

    expect(second.result.current.notice).toEqual({ conflict: true });
  });

  it('does not warn while the saved version is still loading, nor when it is unchanged', async () => {
    const store = createEditorDraftStore();
    store.write('scenario', 'gavan-noch', { name: 'Шхуна' }, SAVED_SCENARIO.savedVersion);

    const view = await mountDraft(store, { ...SAVED_SCENARIO, savedVersion: null });
    expect(view.result.current.notice).toEqual({ conflict: false });

    view.rerender(SAVED_SCENARIO);
    expect(view.result.current.notice).toEqual({ conflict: false });
  });

  it('dates a draft typed before the saved version loaded by the version that loads first', async () => {
    const store = createEditorDraftStore();
    const first = await mountDraft(store, { ...SAVED_SCENARIO, savedVersion: null });
    act(() => first.result.current.track({ name: 'Шхуна' }, false));
    first.rerender(SAVED_SCENARIO);
    act(() => first.result.current.track({ name: 'Бриг' }, false));
    first.unmount();

    const second = await mountDraft(store, SAVED_SCENARIO);

    expect(store.read('scenario', 'gavan-noch')?.baseVersion).toBe(SAVED_SCENARIO.savedVersion);
    expect(second.result.current.notice).toEqual({ conflict: false });
  });

  it('brings a dismissed notice back when the version that loads afterwards is a conflict', async () => {
    const store = createEditorDraftStore();
    store.write('scenario', 'gavan-noch', { name: 'Шхуна' }, SAVED_SCENARIO.savedVersion);
    const view = await mountDraft(store, { ...SAVED_SCENARIO, savedVersion: null });

    act(() => view.result.current.dismissNotice());
    expect(view.result.current.notice).toBeNull();
    view.rerender({ ...SAVED_SCENARIO, savedVersion: '2026-10-03T09:00:00.000Z' });

    expect(view.result.current.notice).toEqual({ conflict: true });
  });

  it('hides a dismissed notice but keeps the draft', async () => {
    const store = createEditorDraftStore();
    store.write('scenario', 'gavan-noch', { name: 'Шхуна' }, SAVED_SCENARIO.savedVersion);
    const view = await mountDraft(store, SAVED_SCENARIO);

    act(() => view.result.current.dismissNotice());

    expect(view.result.current.notice).toBeNull();
    expect(store.read('scenario', 'gavan-noch')?.values).toEqual({ name: 'Шхуна' });
  });
});
