import type { ScenarioSummaryDto } from '@immersion/contracts/scenarios';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { formatRelative } from '../../../shared/lib/format-relative';
import { TrashIcon, XIcon } from '../../../shared/ui/icons';
import { createChat } from '../../chats/api/create-chat';
import { chatListQueryKey } from '../../chats/queries/chat-list-query';
import { useDeleteScenario } from '../mutations/use-delete-scenario';

interface ScenarioRowActionsProps {
  confirmDelete: boolean;
  isDeleting: boolean;
  isStartingChat: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onStartChat: () => void;
}

function ScenarioRowActions({
  confirmDelete,
  isDeleting,
  isStartingChat,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onStartChat,
}: ScenarioRowActionsProps) {
  return confirmDelete ? (
    <>
      <button
        className="btn btn--xs btn--danger"
        disabled={isDeleting}
        onClick={onConfirmDelete}
        title="Удалить сценарий"
        type="button"
      >
        {isDeleting ? '…' : 'Удалить'}
      </button>
      <button
        className="btn btn--icon btn--xs"
        disabled={isDeleting}
        onClick={onCancelDelete}
        title="Не удалять"
        type="button"
      >
        <XIcon size={11} />
      </button>
    </>
  ) : (
    <>
      <button className="btn btn--icon btn--xs" onClick={onAskDelete} title="Удалить сценарий" type="button">
        <TrashIcon size={11} />
      </button>
      <button
        className="btn btn--xs btn--primary"
        disabled={isStartingChat}
        onClick={onStartChat}
        title="Начать новый чат по сценарию"
        type="button"
      >
        {isStartingChat ? '…' : 'Начать чат'}
      </button>
    </>
  );
}

interface ScenarioRowProps {
  scenario: ScenarioSummaryDto;
}

export function ScenarioRow({ scenario }: ScenarioRowProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const startChatMutation = useMutation({
    mutationFn: () => createChat({ scenarioId: scenario.id }),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: chatListQueryKey });
      await navigate({ to: '/chat/$chatId', params: { chatId: response.chat.id } });
    },
  });
  const deleteMutation = useDeleteScenario(scenario.id, {
    onSuccess: () => {
      setConfirmDelete(false);
    },
  });

  const handleStartChat = () => {
    startChatMutation.mutate();
  };

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
      className="card card-hover"
      style={{
        padding: 14,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px',
        gap: 18,
        position: 'relative',
      }}
    >
      <Link
        aria-label={`Открыть сценарий: ${scenario.name}`}
        params={{ scenarioId: scenario.id }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'pointer' }}
        to="/scenarios/$scenarioId"
      />
      <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
        <strong style={{ fontSize: 'var(--fz-md)' }}>{scenario.name}</strong>
        {scenario.preview ? (
          <div
            className="muted"
            style={{
              fontSize: 'var(--fz-sm)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {scenario.preview}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 'var(--fz-sm)' }}>
            Без описания.
          </div>
        )}
        {scenario.tags.length > 0 ? (
          <div className="row gap-4" style={{ flexWrap: 'wrap' }}>
            {scenario.tags.slice(0, 8).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="col" style={{ alignItems: 'flex-end', gap: 6, justifyContent: 'space-between' }}>
        <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
          {formatRelative(scenario.updatedAt)}
        </span>
        <div className="row gap-4" style={{ position: 'relative', zIndex: 2 }}>
          <ScenarioRowActions
            confirmDelete={confirmDelete}
            isDeleting={deleteMutation.isPending}
            isStartingChat={startChatMutation.isPending}
            onAskDelete={handleAskDelete}
            onCancelDelete={handleCancelDelete}
            onConfirmDelete={handleConfirmDelete}
            onStartChat={handleStartChat}
          />
        </div>
      </div>
    </div>
  );
}
