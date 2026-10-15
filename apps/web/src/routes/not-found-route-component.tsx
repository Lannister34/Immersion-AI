import { RouteStatusScreen } from '../shared/ui/route-status-screen';

export function NotFoundRouteComponent() {
  return (
    <RouteStatusScreen
      description="Проверьте адрес или вернитесь в доступные разделы приложения."
      eyebrow="маршрут"
      title="Страница не найдена"
    />
  );
}
