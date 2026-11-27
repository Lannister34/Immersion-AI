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
    <div className="lorebook-row">
      <Link
        aria-label={`Открыть лорбук: ${lorebook.name}`}
        params={{ lorebookId: lorebook.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/lorebooks/$lorebookId"
      />
      <div className="row gap-8 lorebook-row__name">
        <BookIcon size={13} stroke="var(--muted)" />
        <strong className="truncate" style={{ fontSize: 'var(--fz-md)' }}>
          {lorebook.name}
        </strong>
      </div>
      <span className="mono tnum lorebook-row__count">{lorebook.entryCount}</span>
      <div className="row gap-4 lorebook-row__tags">
        {lorebook.tags.slice(0, 4).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <span className="muted mono lorebook-row__time">{formatRelative(lorebook.updatedAt)}</span>
      <div className="row gap-4 lorebook-row__actions">
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
