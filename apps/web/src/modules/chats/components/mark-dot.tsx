export interface MarkDotProps {
  title: string;
}

/**
 * Точка «здесь что-то своё, не из общих настроек». Для скринридера она скрыта:
 * иначе подсказка приклеивалась бы к названию соседней кнопки или поля.
 */
export function MarkDot({ title }: MarkDotProps) {
  return <span aria-hidden="true" className="mark-dot" title={title} />;
}
