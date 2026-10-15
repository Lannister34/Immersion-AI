import { RouteStatusScreen } from '../shared/ui/route-status-screen';

export function RouteErrorComponent() {
  return (
    <RouteStatusScreen
      description="Во время загрузки страницы произошла ошибка. Обновите экран и попробуйте снова."
      eyebrow="ошибка"
      title="Не удалось открыть раздел"
    />
  );
}
