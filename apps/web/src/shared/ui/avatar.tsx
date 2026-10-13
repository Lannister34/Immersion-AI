import { useState } from 'react';

import { createApiUrl } from '../api/client';
import { avatarColor, avatarInitial } from '../lib/avatar';

export interface AvatarProps {
  size: number;
  name: string;
  url: string | null;
}

export function Avatar({ name, size, url }: AvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isBroken = url !== null && url === failedUrl;

  return (
    <span
      className="avatar"
      style={{
        background: isBroken || !url ? avatarColor(name) : 'var(--surface-2)',
        border: 0,
        color: 'white',
        fontSize: Math.max(10, Math.round(size * 0.36)),
        height: size,
        width: size,
      }}
      title={name}
    >
      {url && !isBroken ? (
        <img
          alt=""
          onError={() => setFailedUrl(url)}
          src={createApiUrl(url)}
          style={{ height: '100%', objectFit: 'cover', width: '100%' }}
        />
      ) : (
        avatarInitial(name)
      )}
    </span>
  );
}
