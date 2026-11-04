import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import {
  bareId,
  useAddGroupMember,
  useDeleteGroup,
  useGroupMemberships,
  useRemoveGroupMember,
  type GroupRecord,
  type RoleRecord,
  type UserLite,
} from '../hooks';

interface Props {
  group: GroupRecord;
  users: UserLite[];
  roles: RoleRecord[];
  onEdit: (group: GroupRecord) => void;
}

function userLabel(users: UserLite[], userRef: string): string {
  const id = bareId(userRef);
  const u = users.find((x) => x.id === id);
  return u?.display_name || u?.email || id;
}

/**
 * One group: name/description, its **conferred role** (applied to all members),
 * and an expandable panel to add or remove members. Every member has the same
 * access — the group's role — so there is no per-member role control.
 */
export function GroupCard({ group, users, roles, onEdit }: Props) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickUser, setPickUser] = useState('');

  const membersQuery = useGroupMemberships(expanded ? group.id : '');
  const { data: members, isLoading } = membersQuery;
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const deleteGroup = useDeleteGroup();

  const roleName = group.role ? roles.find((r) => r.id === bareId(group.role!))?.name : undefined;
  const memberUserIds = useMemo(
    () => new Set((members ?? []).map((m) => bareId(m.user))),
    [members],
  );
  const addableUsers = users.filter((u) => !memberUserIds.has(u.id));

  const handleAdd = async () => {
    if (!pickUser) return;
    try {
      await addMember.mutateAsync({ groupId: group.id, userId: pickUser });
      setPickUser('');
      toast.success('Member added');
    } catch {
      // Global mutation error toast (queryClient.ts) surfaces the reason.
    }
  };

  const handleRemove = async (membershipId: string) => {
    try {
      await removeMember.mutateAsync({ groupId: group.id, membershipId });
      toast.success('Member removed');
    } catch {
      /* surfaced globally */
    }
  };

  const handleDelete = async () => {
    try {
      await deleteGroup.mutateAsync(group.id);
      setConfirmDelete(false);
      toast.success('Group deleted');
    } catch {
      /* surfaced globally */
    }
  };

  return (
    <Card data-testid={`group-card-${group.id}`}>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className="flex items-center gap-3 min-w-0 text-left"
          onClick={() => setExpanded((e) => !e)}
          data-testid={`group-expand-${group.id}`}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
          )}
          <Users className="w-5 h-5 text-text-muted flex-shrink-0" />
          <div className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="font-medium text-text-main truncate">{group.name}</span>
              <Badge variant={roleName ? 'info' : 'neutral'}>
                {roleName ? `role: ${roleName}` : 'no role'}
              </Badge>
            </span>
            {group.description && (
              <p className="text-sm text-text-muted truncate">{group.description}</p>
            )}
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onEdit(group)}
            title="Edit group"
            data-testid={`edit-group-${group.id}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            title="Delete group"
            data-testid={`delete-group-${group.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-gray-100 pt-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : (
            <>
              {members && members.length > 0 ? (
                <ul className="space-y-2" data-testid={`group-members-${group.id}`}>
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-text-main">{userLabel(users, m.user)}</span>
                      <button
                        type="button"
                        className="text-gray-400 hover:text-red-600"
                        onClick={() => handleRemove(m.id)}
                        title="Remove member"
                        data-testid={`remove-member-${m.id}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : membersQuery.isError ? (
                <QueryError
                  compact
                  error={membersQuery.error}
                  onRetry={() => void membersQuery.refetch()}
                  title="Couldn’t load members"
                  data-testid={`group-members-error-${group.id}`}
                />
              ) : (
                <EmptyState
                  compact
                  icon={Users}
                  title="No members yet"
                  description="Add someone below to give them this group’s role."
                  data-testid={`group-members-empty-${group.id}`}
                />
              )}

              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-xs text-text-muted">
                  Add member
                  <select
                    className="mt-1 rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm"
                    value={pickUser}
                    onChange={(e) => setPickUser(e.target.value)}
                    data-testid={`add-member-user-${group.id}`}
                  >
                    <option value="">Select a user…</option>
                    {addableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name || u.email || u.id}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!pickUser || addMember.isPending}
                  data-testid={`add-member-submit-${group.id}`}
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Add
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete group"
        message={`Delete "${group.name}"? Its memberships are removed, and any app or grant that targets this group stops applying. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteGroup.isPending}
      />
    </Card>
  );
}
