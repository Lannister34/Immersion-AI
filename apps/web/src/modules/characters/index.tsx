import { Topbar } from '../../app/layout/topbar';
import {
  ChatIcon,
  FilterIcon,
  LayersIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SortIcon,
  UploadIcon,
} from '../../shared/ui/icons';

// TODO: wire to backend characters module once apps/api exposes /api/characters list
interface SampleCharacter {
  name: string;
  desc: string;
  tags: readonly string[];
  date: string;
  chats: number;
  color: string;
  letter: string;
}

const SAMPLE: readonly SampleCharacter[] = [
  {
    name: 'Эля',
    desc: '27 лет, керамистка в небольшой студии. Старательная, но нервная под прессингом наставника.',
    tags: ['ремесло', 'ru', 'драма'],
    date: '19 мар',
    chats: 12,
    color: 'oklch(0.4 0.08 30)',
    letter: 'Э',
  },
  {
    name: 'Кира',
    desc: 'Соседка по квартире, 28 лет. Острый язык, мягкое сердце. Дизайнер на фрилансе.',
    tags: ['город', 'slice-of-life', 'ru'],
    date: '12 мар',
    chats: 8,
    color: 'oklch(0.5 0.15 320)',
    letter: 'К',
  },
  {
    name: 'Дина',
    desc: 'Однокурсница с филфака. Закрытая, любит русскую поэзию начала XX века.',
    tags: ['учёба', 'ru', 'медленный темп'],
    date: '8 мар',
    chats: 3,
    color: 'oklch(0.45 0.1 200)',
    letter: 'Д',
  },
  {
    name: 'Юна',
    desc: 'Школьница 11 класса. Отличница, готовится к ЕГЭ. Маска идеальной девочки.',
    tags: ['школа', 'ru', 'психология'],
    date: '27 фев',
    chats: 1,
    color: 'oklch(0.5 0.12 80)',
    letter: 'Ю',
  },
  {
    name: 'Виктор Ильич',
    desc: 'Наставник в студии керамики. 52 года. Жёсткий, но справедливый. NPC для сценария.',
    tags: ['NPC', 'ремесло'],
    date: '19 мар',
    chats: 0,
    color: 'oklch(0.35 0.04 240)',
    letter: 'Ви',
  },
  {
    name: 'Марта',
    desc: 'Мать одиночка, библиотекарь. 38 лет. Привычка ставить чайник на любую беду.',
    tags: ['семья', 'ru', 'slice-of-life'],
    date: '1 мар',
    chats: 0,
    color: 'oklch(0.4 0.06 50)',
    letter: 'М',
  },
] as const;

export function CharactersScreen() {
  return (
    <main className="main">
      <Topbar
        actions={
          <>
            <button className="btn" type="button">
              <UploadIcon size={13} /> Импорт
            </button>
            <button className="btn btn--primary" type="button">
              <PlusIcon size={13} /> Новый персонаж
            </button>
          </>
        }
        crumbs={[{ label: 'Персонажи', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Персонажи</h1>
              <div className="page__sub">Демо-данные · backend ещё не подключён к этому модулю</div>
            </div>
            <div className="row gap-8">
              <div className="search" style={{ minWidth: 240 }}>
                <SearchIcon size={13} />
                <input placeholder="Имя, описание, тег…" />
              </div>
              <div className="row gap-2 card" style={{ padding: 2 }}>
                <button className="btn btn--xs" style={{ background: 'var(--surface-2)' }} type="button">
                  <LayersIcon size={12} />
                </button>
                <button className="btn btn--xs" type="button">
                  <SortIcon size={12} />
                </button>
              </div>
              <button className="btn btn--ghost-bordered" type="button">
                <FilterIcon size={13} /> Фильтр
              </button>
            </div>
          </div>
          <div className="filters">
            <span className="filter-chip" data-active="true">
              Все теги
            </span>
            {['ru', 'slice-of-life', 'ремесло', 'школа', 'NPC'].map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="page__body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
            {SAMPLE.map((c) => (
              <article
                className="card card-hover"
                key={c.name}
                style={{ padding: 0, overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}
              >
                <div
                  style={{
                    height: 120,
                    background: `linear-gradient(180deg, transparent 40%, oklch(0.15 0.005 270 / 0.9)), ${c.color}`,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'flex-end',
                    padding: 14,
                  }}
                >
                  <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
                    <button
                      className="btn btn--icon btn--xs"
                      style={{ background: 'oklch(0 0 0 / 0.4)' }}
                      type="button"
                    >
                      <MoreIcon size={11} />
                    </button>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      background: 'oklch(0 0 0 / 0.35)',
                      border: '1px solid oklch(1 0 0 / 0.15)',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'white',
                      fontSize: 'var(--fz-lg)',
                      fontWeight: 600,
                    }}
                  >
                    {c.letter}
                  </div>
                </div>
                <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                  <strong style={{ fontSize: 'var(--fz-md)' }}>{c.name}</strong>
                  <div
                    className="muted"
                    style={{
                      fontSize: 'var(--fz-xs)',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {c.desc}
                  </div>
                  <div className="row gap-4" style={{ flexWrap: 'wrap', marginTop: 4 }}>
                    {c.tags.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div
                  className="between"
                  style={{ padding: '8px 12px', borderTop: '1px solid var(--hairline)', background: 'var(--bg-2)' }}
                >
                  <span className="muted mono" style={{ fontSize: 'var(--fz-xs)' }}>
                    {c.chats} чатов · {c.date}
                  </span>
                  <button className="btn btn--xs btn--primary" type="button">
                    <ChatIcon size={11} /> Чат
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
