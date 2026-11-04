import { useState } from 'react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import type { GroupInput, GroupRecord, RoleRecord } from '../hooks';

interface Props {
  initialGroup?: GroupRecord;
  roles: RoleRecord[];
  onSubmit: (data: GroupInput) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const selectClass =
  'w-full rounded-md border border-gray-300 bg-surface-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta';

/**
 * Create/edit a group: name, description, and the **conferred role** — a single
 * role applied to *every* member (group-conferred, not per-member, by design).
 * Picking "No role" makes the group a pure audience (grants can still target it)
 * without conferring any capability of its own.
 */
export function GroupForm({ initialGroup, roles, onSubmit, onCancel, isSubmitting }: Props) {
  const isEdit = !!initialGroup;
  const [name, setName] = useState(initialGroup?.name ?? '');
  const [description, setDescription] = useState(initialGroup?.description ?? '');
  const [role, setRole] = useState(initialGroup?.role ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void onSubmit({ name: name.trim(), description: description.trim() || undefined, role });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Adults, Kids, Guests"
        data-testid="group-name-input"
        autoFocus
      />
      <Input
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What is this group for?"
        data-testid="group-description-input"
      />
      <div>
        <label htmlFor="group-role" className="block text-sm font-medium text-gray-700 mb-1">
          Conferred role
        </label>
        <select
          id="group-role"
          className={selectClass}
          value={role}
          onChange={(e) => setRole(e.target.value)}
          data-testid="group-role-select"
        >
          <option value="">No role (audience only)</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-muted">
          Every member of this group receives this role's access.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting} data-testid="group-submit">
          {isSubmitting ? 'Saving…' : isEdit ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
