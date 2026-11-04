import { useState } from 'react';
import { Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import {
  summarizeRoleGrants,
  useAllUsers,
  useCreateGroup,
  useCreateRole,
  useDeleteRole,
  useGroups,
  useRoles,
  useUpdateGroup,
  useUpdateRole,
  type GroupInput,
  type GroupRecord,
  type RoleInput,
  type RoleRecord,
} from '../hooks';
import { GroupCard } from './GroupCard';
import { GroupForm } from './GroupForm';
import { RoleForm } from './RoleForm';

/**
 * Superuser page to manage the permissions data model: **groups** (create,
 * edit, delete, and manage membership + their conferred role) and **roles**
 * (create/edit/delete grant bundles).
 *
 * Groups are the "set of people" primitive used by both app-access gating
 * (`tagged` audience, §9.2) and access-grants, so this is the main knob an admin
 * turns. Each group confers one role on all its members.
 */
export function PermissionsHome() {
  const toast = useToast();
  const groupsQuery = useGroups();
  const rolesQuery = useRoles();
  const { data: groups, isLoading: groupsLoading } = groupsQuery;
  const { data: roles, isLoading: rolesLoading } = rolesQuery;
  const { data: users } = useAllUsers();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  // Group editor: `null` closed, `'new'` create, a record edit.
  const [groupModal, setGroupModal] = useState<GroupRecord | 'new' | null>(null);

  // Role editor: `null` closed, `'new'` create, a record edit; plus a delete target.
  const [roleModal, setRoleModal] = useState<RoleRecord | 'new' | null>(null);
  const [roleDeleteTarget, setRoleDeleteTarget] = useState<RoleRecord | null>(null);

  const handleGroupSubmit = async (data: GroupInput) => {
    try {
      if (groupModal && groupModal !== 'new') {
        await updateGroup.mutateAsync({ id: groupModal.id, ...data });
        toast.success('Group updated');
      } else {
        await createGroup.mutateAsync(data);
        toast.success('Group created');
      }
      setGroupModal(null);
    } catch {
      // Global mutation error toast (queryClient.ts) surfaces the reason.
    }
  };

  const handleRoleSubmit = async (data: RoleInput) => {
    try {
      if (roleModal && roleModal !== 'new') {
        await updateRole.mutateAsync({ id: roleModal.id, ...data });
        toast.success('Role updated');
      } else {
        await createRole.mutateAsync(data);
        toast.success('Role created');
      }
      setRoleModal(null);
    } catch {
      // Global mutation error toast (queryClient.ts) surfaces the reason.
    }
  };

  const handleRoleDelete = async () => {
    if (!roleDeleteTarget) return;
    try {
      await deleteRole.mutateAsync(roleDeleteTarget.id);
      setRoleDeleteTarget(null);
      toast.success('Role deleted');
    } catch {
      /* surfaced globally */
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Permissions"
        subtitle="Manage groups and view the roles that grant access across the household."
      />

      {/* ── Groups ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-navy">Groups</h2>
          <Button onClick={() => setGroupModal('new')} data-testid="add-group-button">
            <Plus className="w-4 h-4 mr-2" />
            New group
          </Button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : groupsQuery.isError ? (
          <QueryError
            error={groupsQuery.error}
            onRetry={() => void groupsQuery.refetch()}
            title="Couldn’t load groups"
            data-testid="groups-error"
          />
        ) : !groups || groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Create one to gate an app to a set of people, or to share data with them."
            action={{
              label: 'New group',
              onClick: () => setGroupModal('new'),
              testId: 'groups-empty-add',
            }}
            data-testid="groups-empty"
          />
        ) : (
          <div className="space-y-3" data-testid="groups-list">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                users={users ?? []}
                roles={roles ?? []}
                onEdit={setGroupModal}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Roles ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-navy">Roles</h2>
          <Button onClick={() => setRoleModal('new')} data-testid="add-role-button">
            <Plus className="w-4 h-4 mr-2" />
            New role
          </Button>
        </div>
        <p className="text-sm text-text-muted">
          A role is a bundle of access conferred on a group member. Assign one when
          adding someone to a group. Each grant is <span className="font-medium">allow</span> or{' '}
          <span className="font-medium">deny</span> — a deny on an app (or collection) blocks it
          even against another grant.
        </p>
        {rolesLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : rolesQuery.isError ? (
          <QueryError
            error={rolesQuery.error}
            onRetry={() => void rolesQuery.refetch()}
            title="Couldn’t load roles"
            data-testid="roles-error"
          />
        ) : !roles || roles.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No roles defined"
            description="A role bundles the access a group confers on its members."
            action={{
              label: 'New role',
              onClick: () => setRoleModal('new'),
              testId: 'roles-empty-add',
            }}
            data-testid="roles-empty"
          />
        ) : (
          <div className="space-y-3" data-testid="roles-list">
            {roles.map((r) => (
              <Card key={r.id} data-testid={`role-card-${r.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <ShieldCheck className="w-5 h-5 text-accent-terracotta mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text-main">{r.name}</span>
                        <Badge variant="info">{summarizeRoleGrants(r.grants)}</Badge>
                      </div>
                      {r.description && (
                        <p className="text-sm text-text-muted mt-0.5">{r.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRoleModal(r)}
                      title="Edit role"
                      data-testid={`edit-role-${r.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setRoleDeleteTarget(r)}
                      title="Delete role"
                      data-testid={`delete-role-${r.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={groupModal !== null}
        onClose={() => setGroupModal(null)}
        title={groupModal && groupModal !== 'new' ? 'Edit group' : 'New group'}
      >
        {groupModal !== null && (
          <GroupForm
            initialGroup={groupModal === 'new' ? undefined : groupModal}
            roles={roles ?? []}
            onSubmit={handleGroupSubmit}
            onCancel={() => setGroupModal(null)}
            isSubmitting={createGroup.isPending || updateGroup.isPending}
          />
        )}
      </Modal>

      <Modal
        isOpen={roleModal !== null}
        onClose={() => setRoleModal(null)}
        title={roleModal && roleModal !== 'new' ? 'Edit role' : 'New role'}
      >
        {roleModal !== null && (
          <RoleForm
            initialRole={roleModal === 'new' ? undefined : roleModal}
            onSubmit={handleRoleSubmit}
            onCancel={() => setRoleModal(null)}
            isSubmitting={createRole.isPending || updateRole.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!roleDeleteTarget}
        onClose={() => setRoleDeleteTarget(null)}
        onConfirm={handleRoleDelete}
        title="Delete role"
        message={`Delete the "${roleDeleteTarget?.name}" role? Members who were assigned it stop receiving its access. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteRole.isPending}
      />
    </div>
  );
}
