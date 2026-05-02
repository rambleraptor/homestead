'use client';

import { NestedModuleLanding } from '@rambleraptor/homestead-core/shared/components/NestedModuleLanding';
import { superuserModule } from './module.config';

export function SuperuserLanding() {
  return <NestedModuleLanding module={superuserModule} />;
}
