import { useCallback, useRef, useState } from 'react';

import type { EditorDraftKind } from './editor-draft-store';
import { useEditorDraftStore } from './use-editor-draft-store';

export interface EditorDraftOptions {
  entityId: string | null;
  kind: EditorDraftKind;
  savedVersion: string | null;
}

export interface EditorDraftNotice {
  conflict: boolean;
}

export interface EditorDraft<T> {
  close: () => void;
  discard: () => void;
  dismissNotice: () => void;
  markSaved: () => void;
  notice: EditorDraftNotice | null;
  restored: T | null;
  track: (values: T, isPristine: boolean) => void;
}

type NoticeState = 'closed' | 'dismissed' | 'open';

export function useEditorDraft<T>({ entityId, kind, savedVersion }: EditorDraftOptions): EditorDraft<T> {
  const store = useEditorDraftStore();
  const [snapshot] = useState(() => store.read<T>(kind, entityId));
  const [noticeState, setNoticeState] = useState<NoticeState>(snapshot === null ? 'closed' : 'open');
  const closedRef = useRef(false);

  const track = useCallback(
    (values: T, isPristine: boolean) => {
      if (closedRef.current) return;
      if (isPristine) {
        store.discard(kind, entityId);
        setNoticeState('closed');
        return;
      }
      store.write(kind, entityId, values, savedVersion);
    },
    [entityId, kind, savedVersion, store],
  );

  const discard = useCallback(() => {
    store.discard(kind, entityId);
    setNoticeState('closed');
  }, [entityId, kind, store]);

  const close = useCallback(() => {
    closedRef.current = true;
    discard();
  }, [discard]);

  const markSaved = useCallback(() => {
    if (entityId === null) {
      close();
      return;
    }
    discard();
  }, [close, discard, entityId]);

  const dismissNotice = useCallback(() => {
    setNoticeState((current) => (current === 'open' ? 'dismissed' : current));
  }, []);

  const conflict =
    snapshot !== null &&
    snapshot.baseVersion !== null &&
    savedVersion !== null &&
    snapshot.baseVersion !== savedVersion;
  const showNotice = noticeState === 'open' || (noticeState === 'dismissed' && conflict);

  return {
    close,
    discard,
    dismissNotice,
    markSaved,
    notice: showNotice ? { conflict } : null,
    restored: snapshot?.values ?? null,
    track,
  };
}
