import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Shield, User as UserIcon, Pencil, Trash2, Eye } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { fetchPermissionContextFor } from '@rambleraptor/homestead-core/permissions/client';
import { useAddGroupMember } from '@rambleraptor/homestead-core/permissions/hooks';
import { useUsers } from '../hooks/useUsers';
import { useCreateUser } from '../hooks/useCreateUser';
import { useUpdateUser } from '../hooks/useUpdateUser';
import { useDeleteUser } from '../hooks/useDeleteUser';
import { UserForm } from './UserForm';
import type { ManagedUser, UserFormData } from '../types';

export function UsersHome() {
  const { user: currentUser, startViewAs } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const addGroupMember = useAddGroupMember();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [viewAsPendingId, setViewAsPendingId] = useState<string | null>(null);

  // Enter a "view as" preview: resolve the target's real, server-side
  // permission context first (so the client gates match what the server would
  // enforce), then flip the effective identity and land on their dashboard.
  const handleViewAs = async (u: ManagedUser) => {
    setViewAsPendingId(u.id);
    try {
      const permissions = await fetchPermissionContextFor(u.id);
      if (!permissions) {
        toast.error("Couldn't load this user's permissions.");
        return;
      }
      startViewAs({
        id: u.id,
        name: u.display_name || u.email,
        email: u.email,
        type: u.type ?? 'regular',
        permissions,
      });
      navigate('/dashboard');
    } finally {
      setViewAsPendingId(null);
    }
  };

  const handleCreate = async (data: UserFormData) => {
    try {
      const created = await createUser.mutateAsync(data);
      // Assign the chosen access level by adding the new user to its
      // role-bearing group. Report a partial failure separately: the account
      // already exists, so the admin should finish the assignment by hand
      // rather than think the whole create failed.
      if (data.groupId) {
        try {
          await addGroupMember.mutateAsync({ groupId: data.groupId, userId: created.id });
        } catch {
          setIsCreateOpen(false);
          toast.error(
            'User created, but setting their access level failed. Assign it on the Permissions page.',
          );
          return;
        }
      }
      setIsCreateOpen(false);
      toast.success('User created');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleUpdate = async (data: UserFormData) => {
    if (!editingUser) return;
    try {
      await updateUser.mutateAsync({ id: editingUser.id, data });
      setEditingUser(null);
      toast.success('User updated');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.success('User deleted');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Create and manage user accounts."
        actions={
          <Button onClick={() => setIsCreateOpen(true)} data-testid="add-user-button">
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        }
      />

      {!users || users.length === 0 ? (
        <Card>
          <p className="text-center text-gray-600 py-8">No users yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const isSelf = currentUser?.id === u.id;
            const isSuper = u.type === 'superuser';
            return (
              <Card key={u.id}>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {isSuper ? (
                      <Shield className="w-5 h-5 text-accent-terracotta flex-shrink-0" />
                    ) : (
                      <UserIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 truncate">
                          {u.display_name || u.email}
                        </span>
                        {isSuper && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-terracotta/10 text-accent-terracotta-hover">
                            superuser
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            you
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{u.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!isSelf && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewAs(u)}
                        disabled={viewAsPendingId !== null}
                        title="See Homestead with this user's permissions"
                        data-testid={`view-as-user-${u.id}`}
                      >
                        {viewAsPendingId === u.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingUser(u)}
                      data-testid={`edit-user-${u.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget(u)}
                      disabled={isSelf}
                      title={isSelf ? "You can't delete your own account" : 'Delete user'}
                      data-testid={`delete-user-${u.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create User">
        <UserForm
          onSubmit={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          isSubmitting={createUser.isPending}
        />
      </Modal>

      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Edit User"
      >
        {editingUser && (
          <UserForm
            initialData={editingUser}
            onSubmit={handleUpdate}
            onCancel={() => setEditingUser(null)}
            isSubmitting={updateUser.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete User"
        message={`Delete "${deleteTarget?.display_name || deleteTarget?.email}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteUser.isPending}
      />
    </div>
  );
}
