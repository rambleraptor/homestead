/**
 * BootstrapEncryption Component
 *
 * A form for setting up encryption for the first time by creating a family password.
 */

import React, { useState } from 'react';
import { bootstrapEncryption } from '../api';

interface BootstrapEncryptionProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function BootstrapEncryption({
  isOpen,
  onClose,
  onSuccess,
}: BootstrapEncryptionProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsBootstrapping(true);
    setError(null);

    try {
      await bootstrapEncryption(password);
      setPassword('');
      setConfirmPassword('');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to bootstrap encryption:', err);
      setError(err instanceof Error ? err.message : 'Failed to set up encryption');
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setConfirmPassword('');
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
              🔐 Set Up Encrypted Fields
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isBootstrapping}
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
            Create a family password to enable encrypted fields. This password will be
            required to view and edit encrypted data.
          </p>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
            <p className="text-sm text-yellow-800">
              ⚠️ <strong>Important:</strong> Keep this password safe. If you lose it,
              encrypted data cannot be recovered.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Family Password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password (min 8 characters)"
                autoFocus
                disabled={isBootstrapping}
                required
                minLength={8}
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Confirm password"
                disabled={isBootstrapping}
                required
                minLength={8}
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
                disabled={isBootstrapping}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isBootstrapping || !password || !confirmPassword}
              >
                {isBootstrapping ? 'Setting up...' : 'Set Up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
