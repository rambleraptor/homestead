'use client';

import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Input } from '@rambleraptor/homestead-core/shared/components/Input';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useChangePassword } from '../hooks/useChangePassword';

export function ChangePasswordForm() {
  const [formData, setFormData] = useState({
    oldPassword: '',
    password: '',
    passwordConfirm: '',
  });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');

  const changePassword = useChangePassword();
  const { success, error: showError } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.oldPassword || !formData.password || !formData.passwordConfirm) {
      setError('All fields are required');
      return;
    }

    if (formData.password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (formData.password !== formData.passwordConfirm) {
      setError('New passwords do not match');
      return;
    }

    if (formData.oldPassword === formData.password) {
      setError('New password must be different from current password');
      return;
    }

    try {
      await changePassword.mutateAsync(formData);
      success('Password changed successfully');

      // Reset form
      setFormData({
        oldPassword: '',
        password: '',
        passwordConfirm: '',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change password';
      setError(errorMessage);
      showError(errorMessage);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-4">
        <Lock className="w-6 h-6 text-gray-600 mt-1" />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-2">
            Change Password
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Update your password to keep your account secure.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 text-sm bg-red-50/20 text-red-600 rounded-md">
                {error}
              </div>
            )}

            <div className="relative">
              <Input
                id="oldPassword"
                type={showOldPassword ? 'text' : 'password'}
                name="oldPassword"
                label="Current Password"
                value={formData.oldPassword}
                onChange={handleChange}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowOldPassword(!showOldPassword)}
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
              >
                {showOldPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="relative">
              <Input
                id="password"
                type={showNewPassword ? 'text' : 'password'}
                name="password"
                label="New Password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
              >
                {showNewPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="relative">
              <Input
                id="passwordConfirm"
                type={showConfirmPassword ? 'text' : 'password'}
                name="passwordConfirm"
                label="Confirm New Password"
                value={formData.passwordConfirm}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-9 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>At least 8 characters long</li>
                <li>Different from your current password</li>
              </ul>
            </div>

            <div>
              <Button
                type="submit"
                disabled={changePassword.isPending}
              >
                {changePassword.isPending ? 'Changing Password...' : 'Change Password'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Card>
  );
}
