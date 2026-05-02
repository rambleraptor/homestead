'use client';

import { NestedModuleLanding } from '@/shared/components/NestedModuleLanding';
import { superuserModule } from './module.config';

export function SuperuserLanding() {
  return <NestedModuleLanding module={superuserModule} />;
}
