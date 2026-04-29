'use client';

import { UsersHome } from '@/modules/superuser/users/components/UsersHome';
import { ModuleEnabledGate } from '@/shared/components/ModuleEnabledGate';

export default function SuperuserUsersPage() {
  return (
    <ModuleEnabledGate moduleId="users">
      <UsersHome />
    </ModuleEnabledGate>
  );
}
