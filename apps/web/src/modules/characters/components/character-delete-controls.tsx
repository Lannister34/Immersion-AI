import { TrashIcon, XIcon } from '../../../shared/ui/icons';
import type { CharacterActions } from '../mutations/use-character-actions';

interface CharacterDeleteControlsProps {
  actions: CharacterActions;
  darkOverlay?: boolean;
}

export function CharacterDeleteControls({ actions, darkOverlay = false }: CharacterDeleteControlsProps) {
  const overlayStyle = darkOverlay ? { background: 'oklch(0 0 0 / 0.45)' } : undefined;

  if (actions.confirmDelete) {
    return (
      <>
        <button
          className="btn btn--xs btn--danger"
          disabled={actions.deleteMutation.isPending}
          onClick={actions.handleConfirmDelete}
          title="Удалить карточку без возможности восстановления"
          type="button"
        >
          {actions.deleteMutation.isPending ? '…' : 'Удалить'}
        </button>
        <button
          className="btn btn--icon btn--xs"
          disabled={actions.deleteMutation.isPending}
          onClick={actions.handleCancelDelete}
          style={overlayStyle}
          title="Не удалять"
          type="button"
        >
          <XIcon size={11} />
        </button>
      </>
    );
  }

  return (
    <button
      className="btn btn--icon btn--xs"
      onClick={actions.handleAskDelete}
      style={overlayStyle}
      title="Удалить карточку"
      type="button"
    >
      <TrashIcon size={11} />
    </button>
  );
}
