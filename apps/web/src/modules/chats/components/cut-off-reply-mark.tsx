const CUT_OFF_REPLY_TEXT = 'Ответ оборван: закончился контекст или лимит ответа';

const CUT_OFF_REPLY_HINT =
  'Модель не дописала ответ: место под ответ в окне контекста или лимит ответа исчерпаны. Его можно продолжить кнопкой «Продолжить» или увеличить лимит ответа либо контекст.';

export function CutOffReplyMark() {
  return (
    <span className="pill pill--warn" role="note" style={{ alignSelf: 'flex-start' }} title={CUT_OFF_REPLY_HINT}>
      {CUT_OFF_REPLY_TEXT}
    </span>
  );
}
