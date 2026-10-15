export function ChatListSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--hairline)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '40px minmax(0, 1.2fr) minmax(0, 2fr) 100px 80px',
            gap: 14,
            alignItems: 'center',
            padding: '12px 14px',
            background: 'var(--bg)',
          }}
        >
          <div className="avatar avatar--36" style={{ opacity: 0.4 }} />
          <div className="col" style={{ gap: 6 }}>
            <div style={{ height: 10, width: '40%', background: 'var(--surface-2)', borderRadius: 4 }} />
            <div style={{ height: 8, width: '70%', background: 'var(--surface-2)', borderRadius: 4 }} />
          </div>
          <div style={{ height: 10, width: '90%', background: 'var(--surface-2)', borderRadius: 4 }} />
          <div style={{ height: 10, width: 50, background: 'var(--surface-2)', borderRadius: 4, marginLeft: 'auto' }} />
          <div />
        </div>
      ))}
    </div>
  );
}
