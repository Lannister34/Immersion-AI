import { Topbar } from '../../app/layout/topbar';
import { BookIcon, MoreIcon, PlusIcon, SearchIcon, UploadIcon } from '../../shared/ui/icons';

// TODO: wire to backend lorebooks module once apps/api exposes /api/lorebooks list
interface SampleLorebook {
  name: string;
  count: number;
  tags: readonly string[];
  date: string;
}

const SAMPLE: readonly SampleLorebook[] = [
  { name: 'Студия «Меандр»', count: 24, tags: ['ремесло'], date: '12 апр' },
  { name: 'Выставка-2026', count: 18, tags: ['ремесло', 'даты'], date: '5 апр' },
  { name: 'Город · районы', count: 47, tags: ['город', 'ru'], date: '1 апр' },
  { name: 'Личная биография · Эля', count: 12, tags: ['биография'], date: '29 мар' },
  { name: 'Квартира на Гончарной', count: 31, tags: ['город', 'места'], date: '20 мар' },
  { name: 'Школа №54', count: 22, tags: ['школа'], date: '10 мар' },
];

export function LorebooksScreen() {
  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button className="btn" type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <button className="btn btn--primary" type="button">
              <PlusIcon size={13} /> Новый лорбук
            </button>
          </>
        }
        crumbs={[{ label: 'Лорбуки', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Лорбуки</h1>
              <div className="page__sub">Демо-данные · backend ещё не подключён к этому модулю</div>
            </div>
            <div className="search" style={{ minWidth: 280 }}>
              <SearchIcon size={13} />
              <input placeholder="Имя или ключ…" />
            </div>
          </div>
        </div>
        <div className="page__body">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Записей</th>
                  <th>Теги</th>
                  <th>Изменён</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {SAMPLE.map((book) => (
                  <tr key={book.name}>
                    <td>
                      <div className="row gap-8">
                        <BookIcon size={13} />
                        <strong style={{ fontWeight: 600 }}>{book.name}</strong>
                      </div>
                    </td>
                    <td className="mono tnum">{book.count}</td>
                    <td>
                      <div className="row gap-4">
                        {book.tags.map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                      {book.date}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn--icon btn--xs" type="button">
                        <MoreIcon size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
