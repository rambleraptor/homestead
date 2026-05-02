import type { ComponentType, ReactNode } from 'react';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';
import { SuperuserGate } from './SuperuserGate';

export type GateName = 'enabled' | 'superuser';

interface GateProps {
  moduleId: string;
  children: ReactNode;
}

function EnabledGate({ moduleId, children }: GateProps) {
  return <ModuleEnabledGate moduleId={moduleId}>{children}</ModuleEnabledGate>;
}

function SuperuserGateWrapper({ children }: GateProps) {
  return <SuperuserGate>{children}</SuperuserGate>;
}

export const gateComponents: Record<GateName, ComponentType<GateProps>> = {
  enabled: EnabledGate,
  superuser: SuperuserGateWrapper,
};
