/**
 * FamilyPasswordPrompt Component
 *
 * A modal dialog for entering the family password to unlock encrypted fields.
 */

import React, { useState } from 'react';
import { useEncryptedSession } from '../useEncryptedSession';
import type { EncryptionMetadata } from '../types';

interface FamilyPasswordPromptProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: EncryptionMetadata | null;
  onSuccess?: () => void;
}

export function FamilyPasswordPrompt({
  isOpen,
  onClose,
  metadata,
  onSuccess,
}: FamilyPasswordPromptProps) {
  const { unlockEncryption } = useEncryptedSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!metadata) {
      setError('Encryption metadata not available');
      return;
    }

    setIsUnlocking(true);
    setError(null);

    try {
      await unlockEncryption(metadata, password);
      setPassword('');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to unlock encryption:', err);
      setError('Invalid password. Please try again.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              🔒 Unlock Encrypted Fields
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isUnlocking}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <p className="text-gray-600 mb-4">
            Enter your family password to unlock and view encrypted fields.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                htmlFor="family-password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Family Password
              </label>
              <input
                id="family-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                autoFocus
                disabled={isUnlocking}
                required
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={isUnlocking}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isUnlocking || !password}
              >
                {isUnlocking ? 'Unlocking...' : 'Unlock'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
