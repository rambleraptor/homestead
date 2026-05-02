import { MinigolfHome } from '@rambleraptor/homestead-modules/games/minigolf/components/MinigolfHome';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function MinigolfPage() {
  return (
    <ModuleEnabledGate moduleId="minigolf">
      <MinigolfHome />
    </ModuleEnabledGate>
  );
}
