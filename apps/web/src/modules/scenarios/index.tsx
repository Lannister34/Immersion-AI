import { Topbar } from '../../app/layout/topbar';
import { PlusIcon, SearchIcon, UploadIcon } from '../../shared/ui/icons';

// TODO: wire to backend scenarios module once apps/api exposes /api/scenarios list
interface SampleScenario {
  name: string;
  desc: string;
  chars: readonly string[];
  colors: readonly string[];
  tags: readonly string[];
  date: string;
}

const SAMPLE: readonly SampleScenario[] = [
  {
    name: 'Студия керамики',
    desc: 'Поздняя смена. Третья форма ушла в брак.',
    chars: ['Э'],
    colors: ['oklch(0.4 0.08 30)'],
    tags: ['ремесло', 'конфликт'],
    date: '19 мар',
  },
  {
    name: 'Неожиданный гость',
    desc: 'Возвращение домой раньше срока.',
    chars: ['К', 'М'],
    colors: ['oklch(0.5 0.15 320)', 'oklch(0.4 0.06 50)'],
    tags: ['семья', 'ru'],
    date: '12 мар',
  },
  {
    name: 'Экзамен в школе',
    desc: 'Подозрение в списывании на пробном ЕГЭ.',
    chars: ['Ю'],
    colors: ['oklch(0.5 0.12 80)'],
    tags: ['школа', 'психология'],
    date: '27 фев',
  },
  {
    name: 'Домашний разлад',
    desc: 'Тихий вечер после крупной ссоры.',
    chars: ['Э'],
    colors: ['oklch(0.4 0.08 30)'],
    tags: ['семья', 'драма'],
    date: '23 апр',
  },
  {
    name: 'Столкновение в коридоре',
    desc: 'Случайная встреча перед лекцией.',
    chars: ['Д'],
    colors: ['oklch(0.45 0.1 200)'],
    tags: ['учёба', 'ru'],
    date: '3 мар',
  },
  {
    name: 'Анонимный чат',
    desc: 'Знакомство без имён и лиц.',
    chars: ['?'],
    colors: ['var(--surface-2)'],
    tags: ['mystery'],
    date: '15 фев',
  },
] as const;

export function ScenariosScreen() {
  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button className="btn" type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <button className="btn btn--primary" type="button">
              <PlusIcon size={13} /> Новый сценарий
            </button>
          </>
        }
        crumbs={[{ label: 'Сценарии', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Сценарии</h1>
              <div className="page__sub">Демо-данные · backend ещё не подключён к этому модулю</div>
            </div>
            <div className="search" style={{ minWidth: 280 }}>
              <SearchIcon size={13} />
              <input placeholder="Поиск…" />
            </div>
          </div>
          <div className="filters">
            <span className="filter-chip" data-active="true">
              Все
            </span>
            {['ремесло', 'семья', 'школа', 'драма', 'конфликт'].map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="page__body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
            {SAMPLE.map((s) => (
              <article className="card card-hover" key={s.name} style={{ padding: 14, display: 'grid', gap: 10 }}>
                <div className="between">
                  <strong style={{ fontSize: 'var(--fz-md)' }}>{s.name}</strong>
                  <div className="row gap-4">
                    {s.chars.map((char, j) => (
                      <div
                        className="avatar avatar--24"
                        key={`${s.name}-${char}-${j}`}
                        style={{ background: s.colors[j], color: 'white', border: 0 }}
                      >
                        {char}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 'var(--fz-sm)', lineHeight: 1.5 }}>
                  {s.desc}
                </div>
                <div className="between">
                  <div className="row gap-4">
                    {s.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                    {s.date}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
