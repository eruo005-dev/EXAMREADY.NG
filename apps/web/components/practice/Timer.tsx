'use client';

import { Badge } from '@examready/ui';
import { useEffect, useState } from 'react';


export function Timer({
  startedAt,
  limitSeconds,
  onExpire,
}: {
  startedAt: Date;
  limitSeconds?: number | null;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((now - startedAt.getTime()) / 1000);
  const remaining = limitSeconds ? Math.max(0, limitSeconds - elapsed) : null;

  useEffect(() => {
    if (remaining === 0 && onExpire) onExpire();
  }, [remaining, onExpire]);

  const display = remaining !== null ? remaining : elapsed;
  const minutes = Math.floor(display / 60);
  const seconds = display % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const variant = remaining !== null && remaining <= 60 ? 'destructive' : 'outline';

  return (
    <Badge variant={variant} className="font-mono">
      {formatted}
    </Badge>
  );
}
