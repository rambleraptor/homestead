'use client';

import { NestedModuleLanding } from '@rambleraptor/homestead-core/shared/components/NestedModuleLanding';
import { gamesModule } from './module.config';

export function GamesLanding() {
  return <NestedModuleLanding module={gamesModule} />;
}
