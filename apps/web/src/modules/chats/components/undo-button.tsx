import { UndoIcon } from '../../../shared/ui/icons';

interface UndoButtonProps {
  inheritedText: string;
  onClick: () => void;
}

export function UndoButton({ inheritedText, onClick }: UndoButtonProps) {
  return (
    <button
      className="rp-param__undo"
      onClick={onClick}
      title={inheritedText.length > 0 ? `Вернуть ${inheritedText} из набора` : 'Вернуть значение из набора'}
      type="button"
    >
      <UndoIcon size={13} />
    </button>
  );
}
