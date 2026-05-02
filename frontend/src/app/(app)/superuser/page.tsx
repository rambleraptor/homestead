'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { NestedModuleLanding } from '@/shared/components/NestedModuleLanding';
import { superuserModule } from '@/modules/superuser/module.config';
import { Spinner } from '@/shared/components/Spinner';

export default function SuperuserPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && user.type !== 'superuser') {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || user.type !== 'superuser') {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return <NestedModuleLanding module={superuserModule} />;
}
