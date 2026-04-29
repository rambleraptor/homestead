import { NestedModuleLanding } from '@/shared/components/NestedModuleLanding';
import { gamesModule } from '@/modules/games/module.config';

export default function GamesPage() {
  return <NestedModuleLanding module={gamesModule} />;
}
