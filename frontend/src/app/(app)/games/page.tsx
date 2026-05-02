'use client';

import { NestedModuleLanding } from '@/shared/components/NestedModuleLanding';
import { gamesModule } from '@rambleraptor/homestead-modules/games/module.config';

export default function GamesPage() {
  return <NestedModuleLanding module={gamesModule} />;
}
