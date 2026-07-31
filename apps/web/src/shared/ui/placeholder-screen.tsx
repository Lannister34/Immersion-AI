import type { ReactNode } from 'react';

import { Topbar } from '../../app/layout/topbar';

interface PlaceholderScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets?: string[];
  children?: ReactNode;
}

export function PlaceholderScreen({ eyebrow, title, description, bullets, children }: PlaceholderScreenProps) {
  return (
    <main className="main">
      <Topbar crumbs={[{ label: title, strong: true }]} />
      <div className="page">
        <div className="page__head">
          <div className="page__title-row">
            <div>
              <div
                style={{
                  color: 'var(--accent)',
                  fontSize: 'var(--fz-2xs)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {eyebrow}
              </div>
              <h1 className="page__title">{title}</h1>
              <div className="page__sub">{description}</div>
            </div>
          </div>
        </div>
        <div className="page__body">
          {bullets && bullets.length > 0 ? (
            <ul style={{ color: 'var(--text-1)', lineHeight: 1.6, paddingLeft: 18, margin: 0 }}>
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {children ? <div style={{ marginTop: '20px' }}>{children}</div> : null}
        </div>
      </div>
    </main>
  );
}
