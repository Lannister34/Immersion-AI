import { useQuery } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';

import { getRuntimeOverview } from '../../modules/server-control/api/get-runtime-overview';
import { settingsOverviewQueryOptions } from '../../modules/settings';
import { type RuntimeBadgeStatus, Sidebar } from './sidebar';

interface RuntimeBadge {
  status: RuntimeBadgeStatus;
  label: string;
  detail?: string | undefined;
}

type RuntimeOverviewQuery = ReturnType<typeof useQuery<Awaited<ReturnType<typeof getRuntimeOverview>>>>;

function describeRuntime(query: RuntimeOverviewQuery): RuntimeBadge {
  if (query.isError) {
    return { status: 'error', label: 'Ошибка runtime', detail: 'API не отвечает' };
  }

  const overview = query.data;

  if (!overview) {
    return { status: 'stopped', label: 'Runtime ещё не загружен' };
  }

  const { serverStatus, serverConfig } = overview;

  switch (serverStatus.status) {
    case 'running': {
      const modelName = serverStatus.model ?? 'модель не выбрана';
      return { status: 'running', label: modelName, detail: `port ${serverConfig.port}` };
    }
    case 'starting':
      return { status: 'starting', label: 'Запуск runtime…' };
    case 'stopping':
      return { status: 'starting', label: 'Остановка runtime…' };
    case 'error':
      return { status: 'error', label: 'Ошибка запуска', detail: serverStatus.error ?? undefined };
    case 'idle':
    default:
      return { status: 'stopped', label: 'Runtime остановлен' };
  }
}

export function RootLayout() {
  const runtimeOverviewQuery = useQuery({
    queryKey: ['runtime', 'overview'],
    queryFn: getRuntimeOverview,
    refetchInterval: 5000,
  });
  const settingsQuery = useQuery(settingsOverviewQueryOptions());

  const runtime = describeRuntime(runtimeOverviewQuery);
  const userName = settingsQuery.data?.profile.userName?.trim();
  const persona = userName
    ? {
        initial: userName.slice(0, 1).toUpperCase(),
        name: userName,
        hint: settingsQuery.data?.profile.userPersona ? 'persona задана' : 'persona не задана',
      }
    : undefined;

  return (
    <div className="frame">
      <Sidebar persona={persona} runtime={runtime} />
      <Outlet />
    </div>
  );
}
