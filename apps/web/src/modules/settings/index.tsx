import { useQuery } from '@tanstack/react-query';
import type { JSX, ReactNode } from 'react';

import { Topbar } from '../../app/layout/topbar';
import { CheckIcon, CodeIcon, CpuIcon, type IconProps, SlidersIcon, UserIcon } from '../../shared/ui/icons';
import { ModelBindingsCard } from './components/model-bindings-card';
import { ProfileCard } from './components/profile-card';
import { SamplerCard } from './components/sampler-card';
import { settingsOverviewQueryOptions } from './queries/settings-overview-query';

export { getSettingsOverview } from './api/get-settings-overview';
export { settingsOverviewQueryKey, settingsOverviewQueryOptions } from './queries/settings-overview-query';

interface SettingsSection {
  id: string;
  label: string;
  icon: (props: IconProps) => JSX.Element;
}

const SECTIONS: SettingsSection[] = [
  { id: 'profile', label: 'Профиль / Persona', icon: UserIcon },
  { id: 'prompts', label: 'System Prompt', icon: CodeIcon },
  { id: 'sampler', label: 'Sampler Presets', icon: SlidersIcon },
  { id: 'models', label: 'Model Bindings', icon: CpuIcon },
];

export function SettingsScreen() {
  const settingsQuery = useQuery(settingsOverviewQueryOptions());
  const data = settingsQuery.data;

  let body: ReactNode;
  if (settingsQuery.isLoading) {
    body = (
      <div className="card" style={{ padding: 18 }}>
        <div className="muted">Загружаем профиль…</div>
      </div>
    );
  } else if (settingsQuery.isError || !data) {
    body = (
      <div className="card" style={{ padding: 18 }}>
        <div className="muted">Не удалось получить настройки. Проверьте rewrite API.</div>
      </div>
    );
  } else {
    body = (
      <>
        <ProfileCard data={data} />
        <SamplerCard data={data} />
        <ModelBindingsCard data={data} />
      </>
    );
  }

  return (
    <main className="main">
      <Topbar
        actions={
          settingsQuery.isFetching ? null : (
            <span className="pill pill--ok">
              <CheckIcon size={11} /> сохранено
            </span>
          )
        }
        crumbs={[{ label: 'Настройки', strong: true }]}
        search={false}
      />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <h1 className="page__title">Настройки</h1>
              <div className="page__sub">Профиль · prompt · sampler · runtime · UI</div>
            </div>
          </div>
        </div>
        <div className="page__body" style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 24 }}>
          <nav className="col gap-2" style={{ alignSelf: 'start', position: 'sticky', top: 0 }}>
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <a
                  className="sb__link"
                  href={`#${section.id}`}
                  key={section.id}
                  aria-current={section.id === 'profile' ? 'page' : undefined}
                >
                  <span className="sb__icon">
                    <Icon size={14} />
                  </span>
                  <span>{section.label}</span>
                  <span />
                </a>
              );
            })}
          </nav>
          <div className="col gap-16">{body}</div>
        </div>
      </div>
    </main>
  );
}
