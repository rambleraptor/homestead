import { PictionaryHome } from '@rambleraptor/homestead-modules/games/pictionary/components/PictionaryHome';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function PictionaryPage() {
  return (
    <ModuleEnabledGate moduleId="pictionary">
      <PictionaryHome />
    </ModuleEnabledGate>
  );
}
