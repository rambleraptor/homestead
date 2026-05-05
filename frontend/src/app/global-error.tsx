'use client';

import { useEffect } from 'react';
import { InternalError } from '@rambleraptor/homestead-core/router/InternalError';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('Global error boundary triggered', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="font-body bg-bg-pearl text-text-main">
        <InternalError error={error} reset={reset} />
      </body>
    </html>
  );
}
