export type EditorDraftKind = 'character' | 'lorebook' | 'scenario';

export interface StoredEditorDraft<T> {
  baseVersion: string | null;
  values: T;
}

export interface EditorDraftStore {
  discard(kind: EditorDraftKind, entityId: string | null): void;
  read<T>(kind: EditorDraftKind, entityId: string | null): StoredEditorDraft<T> | null;
  write<T>(kind: EditorDraftKind, entityId: string | null, values: T, baseVersion: string | null): void;
}

function draftKey(kind: EditorDraftKind, entityId: string | null): string {
  return entityId === null ? `${kind}#new` : `${kind}:${entityId}`;
}

export function createEditorDraftStore(): EditorDraftStore {
  const drafts = new Map<string, StoredEditorDraft<unknown>>();

  return {
    discard(kind, entityId) {
      drafts.delete(draftKey(kind, entityId));
    },
    read<T>(kind: EditorDraftKind, entityId: string | null): StoredEditorDraft<T> | null {
      return (drafts.get(draftKey(kind, entityId)) as StoredEditorDraft<T> | undefined) ?? null;
    },
    write(kind, entityId, values, baseVersion) {
      const key = draftKey(kind, entityId);
      const existing = drafts.get(key);
      drafts.set(key, { baseVersion: existing?.baseVersion ?? baseVersion, values });
    },
  };
}
