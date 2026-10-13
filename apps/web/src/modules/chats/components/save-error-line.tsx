export interface SaveErrorLineProps {
  saveError: string | null;
}

export function SaveErrorLine({ saveError }: SaveErrorLineProps) {
  if (!saveError) {
    return null;
  }

  return <div style={{ color: 'var(--danger)', fontSize: 'var(--fz-2xs)' }}>{saveError}</div>;
}
