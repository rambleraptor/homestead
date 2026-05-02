import { BridgeHome } from '@rambleraptor/homestead-modules/games/bridge/components/BridgeHome';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function BridgePage() {
  return (
    <ModuleEnabledGate moduleId="bridge">
      <BridgeHome />
    </ModuleEnabledGate>
  );
}
