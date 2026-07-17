export interface PickerItem {
  id: string;
  name: string;
}

export interface PickerListProps {
  activeId: string | null;
  disabled: boolean;
  emptyText: string;
  items: PickerItem[];
  loading: boolean;
  loadingText: string;
  onSelect: (id: string) => void;
}

export function PickerList({ activeId, disabled, emptyText, items, loading, loadingText, onSelect }: PickerListProps) {
  if (loading) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        {loadingText}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 'var(--fz-2xs)' }}>
        {emptyText}
      </div>
    );
  }
  return (
    <div
      className="col gap-2"
      style={{
        maxHeight: 220,
        overflowY: 'auto',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-sm)',
        padding: 4,
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            className="btn btn--xs"
            disabled={disabled || isActive}
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: 0,
              color: isActive ? 'var(--accent)' : 'inherit',
              justifyContent: 'flex-start',
              textAlign: 'left',
            }}
            title={item.id}
            type="button"
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
