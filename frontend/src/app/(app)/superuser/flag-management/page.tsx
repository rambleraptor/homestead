'use client';

import { FlagManagementHome } from '@/modules/superuser/flag-management/components/FlagManagementHome';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function SuperuserFlagManagementPage() {
  return (
    <ModuleEnabledGate moduleId="flag-management">
      <FlagManagementHome />
    </ModuleEnabledGate>
  );
}
