export function ScenariosListSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <div className="card" key={index} style={{ height: 110, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
