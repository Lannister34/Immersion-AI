export interface SaveErrorLineProps {
  saveError: string | null;
}

/**
 * Панель сохраняет молча, в фоне: индикатор процесса только мешает.
 * А вот про неудачу молчать нельзя — иначе правка потеряется незаметно.
 */
export function SaveErrorLine({ saveError }: SaveErrorLineProps) {
  if (!saveError) {
    return null;
  }

  return <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{saveError}</div>;
}
