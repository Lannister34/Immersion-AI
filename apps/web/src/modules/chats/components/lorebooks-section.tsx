import { useQuery } from '@tanstack/react-query';

import { lorebookListQueryOptions } from '../../lorebooks/queries/lorebook-list-query';
import { useUpdateChatLorebooks } from '../mutations/use-update-chat-lorebooks';

export interface LorebooksSectionContentProps {
  chatId: string;
  lorebookIds: string[];
}

export function LorebooksSectionContent({ chatId, lorebookIds }: LorebooksSectionContentProps) {
  const query = useQuery(lorebookListQueryOptions());
  const mutation = useUpdateChatLorebooks(chatId);
  const items = query.data?.items ?? [];
  const selected = new Set(lorebookIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    mutation.mutate(Array.from(next));
  };

  if (query.isLoading) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Загружаем…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Не удалось загрузить лорбуки.
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-xs)' }}>
        Лорбуков пока нет — добавьте JSON-файлы в <code>data/worlds/</code>.
      </div>
    );
  }

  return (
    <div className="col gap-6">
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        Подключённые лорбуки добавляются в системный prompt, когда в последних сообщениях встречаются их ключевые слова.
      </div>
      {items.map((lorebook) => {
        const isOn = selected.has(lorebook.id);
        return (
          <label
            className="row gap-8"
            key={lorebook.id}
            style={{ alignItems: 'center', cursor: 'pointer', fontSize: 'var(--fz-sm)', padding: '4px 0' }}
          >
            <input checked={isOn} disabled={mutation.isPending} onChange={() => toggle(lorebook.id)} type="checkbox" />
            <span style={{ flex: 1, minWidth: 0 }} className="truncate">
              {lorebook.name}
            </span>
            <span className="muted mono tnum" style={{ fontSize: 'var(--fz-2xs)' }}>
              {lorebook.entryCount}
            </span>
          </label>
        );
      })}
      {mutation.error ? (
        <div className="muted" style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>
          Не удалось сохранить выбор.
        </div>
      ) : null}
    </div>
  );
}
