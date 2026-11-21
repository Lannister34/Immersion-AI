import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { useApplyRuntimeContext } from '../../server-control';

export interface PendingContextNoticeProps {
  isDraftSaved: boolean;
  isGenerating: boolean;
  isPreviewFetching: boolean;
  pendingContextSize: number;
  runningContextSize: number;
}

function formatTokens(value: number): string {
  return value.toLocaleString('ru-RU');
}

function describeBlock(props: PendingContextNoticeProps): string | null {
  if (props.isGenerating) {
    return 'Дождитесь окончания генерации: перезапуск модели оборвёт ответ.';
  }

  if (!props.isDraftSaved) {
    return 'Настройки чата ещё не сохранены.';
  }

  return props.isPreviewFetching ? 'Обновляем расчёт контекста…' : null;
}

export function PendingContextNotice(props: PendingContextNoticeProps) {
  const apply = useApplyRuntimeContext();
  const block = describeBlock(props);

  return (
    <div className="card col gap-6" role="status" style={{ borderColor: 'var(--warn)', marginBottom: 8, padding: 10 }}>
      <span style={{ fontSize: 'var(--fz-xs)' }}>
        Контекст {formatTokens(props.pendingContextSize)} не применён: модель работает с контекстом{' '}
        {formatTokens(props.runningContextSize)}, и промпт считается по нему. «Применить» перезапустит модель с новым
        контекстом.
      </span>
      <div className="row gap-8" style={{ alignItems: 'center' }}>
        <button
          className="btn btn--xs btn--ghost-bordered"
          disabled={block !== null || apply.isPending}
          onClick={() => apply.mutate(props.pendingContextSize)}
          type="button"
        >
          {apply.isPending ? 'Перезапускаем модель…' : 'Применить'}
        </button>
        {block ? (
          <span className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
            {block}
          </span>
        ) : null}
      </div>
      {apply.error ? (
        <span style={{ color: 'var(--danger)', fontSize: 'var(--fz-xs)' }}>
          {getApiErrorMessage(apply.error, 'Не удалось применить контекст.')}
        </span>
      ) : null}
    </div>
  );
}
