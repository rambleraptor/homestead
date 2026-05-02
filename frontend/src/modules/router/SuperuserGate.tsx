'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { Spinner } from '@/shared/components/Spinner';

interface Props {
  children: ReactNode;
  fallbackPath?: string;
}

export function SuperuserGate({ children, fallbackPath = '/dashboard' }: Props) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && user.type !== 'superuser') {
      router.replace(fallbackPath);
    }
  }, [isLoading, user, router, fallbackPath]);

  if (isLoading || !user || user.type !== 'superuser') {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
