import { useEffect, useMemo, useState } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import {
  useGroups,
  useRoles,
  bareId,
  summarizeRoleGrants,
} from '@rambleraptor/homestead-core/permissions/hooks';
import { NewUserAccessPreview } from './NewUserAccessPreview';
import { UserAccessSummary } from './UserAccessSummary';
import type { ManagedUser, UserFormData } from '../types';
import type { UserType } from '@rambleraptor/homestead-core/auth/types';

interface UserFormProps {
  initialData?: ManagedUser;
  onSubmit: (data: UserFormData) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

/** Built-in roles come first in the picker; any custom groups follow. */
const ROLE_ORDER = ['admin', 'member', 'guest'];

interface AccessOption {
  groupId: string;
  label: string;
  summary: string;
  roleId: string;
}

export function UserForm({ initialData, onSubmit, onCancel, isSubmitting }: UserFormProps) {
  const isEdit = !!initialData;
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [displayName, setDisplayName] = useState(initialData?.display_name ?? '');
  const [type, setType] = useState<UserType>(initialData?.type ?? 'regular');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Access-level picker (create + regular users only): a user gets a role by
  // joining a role-bearing group, so the options are the groups that confer one.
  const { data: groups } = useGroups();
  const { data: roles } = useRoles();
  const [groupId, setGroupId] = useState('');
  const [groupTouched, setGroupTouched] = useState(false);

  const accessOptions = useMemo<AccessOption[]>(() => {
    const roleName = new Map((roles ?? []).map((r) => [r.id, r] as const));
    return (groups ?? [])
      .filter((g) => g.role) // only role-bearing groups confer access
      .map((g) => {
        const role = roleName.get(bareId(g.role!));
        return {
          groupId: g.id,
          roleId: bareId(g.role!),
          label: g.name,
          summary: summarizeRoleGrants(role?.grants),
        };
      })
      .sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a.roleId);
        const bi = ROLE_ORDER.indexOf(b.roleId);
        return (ai === -1 ? ROLE_ORDER.length : ai) - (bi === -1 ? ROLE_ORDER.length : bi);
      });
  }, [groups, roles]);

  // Default a new regular user to the Member level (safe, usable), until the
  // admin picks otherwise. Never override a manual choice.
  useEffect(() => {
    if (isEdit || groupTouched || accessOptions.length === 0) return;
    const member = accessOptions.find((o) => o.roleId === 'member') ?? accessOptions[0];
    setGroupId(member.groupId);
  }, [isEdit, groupTouched, accessOptions]);

  const showAccessPicker = !isEdit && type === 'regular' && accessOptions.length > 0;
  const selectedOption = accessOptions.find((o) => o.groupId === groupId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!isEdit && !password) {
      setError('Password is required');
      return;
    }
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    // Matches the server policy: bcrypt only hashes the first 72 bytes.
    if (password && new TextEncoder().encode(password).length > 72) {
      setError('Password must be at most 72 bytes');
      return;
    }

    void onSubmit({
      email: email.trim(),
      display_name: displayName.trim(),
      type,
      password: password || undefined,
      // Only assign a group for a new regular user; superusers break-glass past
      // data restrictions, so a role is moot for them.
      groupId: showAccessPicker ? groupId || undefined : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 text-sm bg-red-50/20 text-red-600 rounded-md">{error}</div>
      )}

      <Input
        id="user-email"
        type="email"
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        data-testid="user-email-input"
      />

      <Input
        id="user-display-name"
        label="Display Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        data-testid="user-display-name-input"
      />

      <div>
        <label htmlFor="user-type" className="block text-sm font-medium text-gray-700 mb-2">
          Type
        </label>
        <select
          id="user-type"
          value={type}
          onChange={(e) => setType(e.target.value as UserType)}
          className="w-full rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          data-testid="user-type-select"
        >
          <option value="regular">Regular</option>
          <option value="superuser">Superuser</option>
        </select>
      </div>

      {showAccessPicker && (
        <div>
          <label
            htmlFor="user-access-level"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Access level
          </label>
          <select
            id="user-access-level"
            value={groupId}
            onChange={(e) => {
              setGroupTouched(true);
              setGroupId(e.target.value);
            }}
            className="w-full rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
            data-testid="user-access-level-select"
          >
            {accessOptions.map((o) => (
              <option key={o.groupId} value={o.groupId}>
                {o.label}
              </option>
            ))}
          </select>
          {selectedOption && (
            <p className="mt-1 text-xs text-text-muted" data-testid="user-access-level-summary">
              {selectedOption.summary}. You can fine-tune this later on the Permissions page.
            </p>
          )}
        </div>
      )}

      <Input
        id="user-password"
        type="password"
        label={isEdit ? 'New Password (leave blank to keep)' : 'Password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required={!isEdit}
        data-testid="user-password-input"
      />

      {isEdit && initialData ? (
        <UserAccessSummary user={initialData} />
      ) : (
        // The open-household preview only applies when the user won't be placed
        // in a role-bearing group (superuser, or no groups to assign).
        !showAccessPicker && <NewUserAccessPreview type={type} />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Save' : 'Create User'}
        </Button>
      </div>
    </form>
  );
}
