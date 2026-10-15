export function CharactersGridSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <div className="card" key={index} style={{ aspectRatio: '3 / 4', padding: 0, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
