import type { LorebookSummaryDto } from '@immersion/contracts/lorebooks';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { formatRelative } from '../../../shared/lib/format-relative';
import { BookIcon, TrashIcon, XIcon } from '../../../shared/ui/icons';
import { useDeleteLorebook } from '../mutations/use-delete-lorebook';

interface LorebookRowProps {
  lorebook: LorebookSummaryDto;
}

export function LorebookRow({ lorebook }: LorebookRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteMutation = useDeleteLorebook(lorebook.id, {
    onSuccess: () => {
      setConfirmDelete(false);
    },
  });

  const handleAskDelete = () => {
    setConfirmDelete(true);
  };

  const handleConfirmDelete = () => {
    deleteMutation.mutate();
  };

  const handleCancelDelete = () => {
    setConfirmDelete(false);
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 80px minmax(0, 1fr) 120px 100px',
        gap: 14,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--bg)',
      }}
    >
      <Link
        aria-label={`Открыть лорбук: ${lorebook.name}`}
        params={{ lorebookId: lorebook.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/lorebooks/$lorebookId"
      />
      <div className="row gap-8" style={{ minWidth: 0 }}>
        <BookIcon size={13} stroke="var(--muted)" />
        <strong className="truncate" style={{ fontSize: 'var(--fz-md)' }}>
          {lorebook.name}
        </strong>
      </div>
      <span className="mono tnum" style={{ fontSize: 'var(--fz-sm)', color: 'var(--text-1)' }}>
        {lorebook.entryCount}
      </span>
      <div className="row gap-4" style={{ flexWrap: 'wrap', minWidth: 0 }}>
        {lorebook.tags.slice(0, 4).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
        {formatRelative(lorebook.updatedAt)}
      </span>
      <div className="row gap-4" style={{ justifyContent: 'flex-end', position: 'relative', zIndex: 2 }}>
        {confirmDelete ? (
          <>
            <button
              className="btn btn--xs btn--danger"
              disabled={deleteMutation.isPending}
              onClick={handleConfirmDelete}
              title="Удалить лорбук"
              type="button"
            >
              {deleteMutation.isPending ? '…' : 'Удалить'}
            </button>
            <button
              className="btn btn--icon btn--xs"
              disabled={deleteMutation.isPending}
              onClick={handleCancelDelete}
              title="Не удалять"
              type="button"
            >
              <XIcon size={11} />
            </button>
          </>
        ) : (
          <button className="btn btn--icon btn--xs" onClick={handleAskDelete} title="Удалить лорбук" type="button">
            <TrashIcon size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
