'use client';

import { useEffect } from 'react';
import { InternalError } from '@rambleraptor/homestead-core/router/InternalError';
import { logger } from '@rambleraptor/homestead-core/utils/logger';

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('App segment error', error);
  }, [error]);

  return <InternalError error={error} reset={reset} />;
}
