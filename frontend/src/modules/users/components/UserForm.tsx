'use client';

import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import type { ManagedUser, UserFormData } from '../types';
import type { UserType } from '@/core/auth/types';

interface UserFormProps {
  initialData?: ManagedUser;
  onSubmit: (data: UserFormData) => void | Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function UserForm({ initialData, onSubmit, onCancel, isSubmitting }: UserFormProps) {
  const isEdit = !!initialData;
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [displayName, setDisplayName] = useState(initialData?.display_name ?? '');
  const [type, setType] = useState<UserType>(initialData?.type ?? 'regular');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

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

    void onSubmit({
      email: email.trim(),
      display_name: displayName.trim(),
      type,
      password: password || undefined,
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
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-terracotta"
          data-testid="user-type-select"
        >
          <option value="regular">Regular</option>
          <option value="superuser">Superuser</option>
        </select>
      </div>

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
