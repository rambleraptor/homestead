/**
 * Tests for ChangePasswordForm component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import * as useChangePasswordModule from '../hooks/useChangePassword';
import * as useToastModule from '@rambleraptor/homestead-core/shared/components/ToastProvider';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('ChangePasswordForm', () => {
  const mockMutateAsync = vi.fn();
  const mockSuccess = vi.fn();
  const mockError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useChangePasswordModule, 'useChangePassword').mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      // Add other mutation properties as needed
    } as unknown as ReturnType<typeof useChangePasswordModule.useChangePassword>);

    vi.spyOn(useToastModule, 'useToast').mockReturnValue({
      showToast: vi.fn(),
      success: mockSuccess,
      error: mockError,
      info: vi.fn(),
      warning: vi.fn(),
    });
  });

  it('should render all password fields', () => {
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  it('should render password requirements', () => {
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    expect(screen.getByText(/at least 8 characters long/i)).toBeInTheDocument();
    expect(screen.getByText(/different from your current password/i)).toBeInTheDocument();
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    expect(currentPasswordInput).toHaveAttribute('type', 'password');

    const toggleButtons = screen.getAllByRole('button');
    const toggleCurrentPassword = toggleButtons.find(
      (btn) => btn.getAttribute('type') === 'button'
    );

    if (toggleCurrentPassword) {
      await user.click(toggleCurrentPassword);
      expect(currentPasswordInput).toHaveAttribute('type', 'text');
    }
  });

  it('should have required fields', () => {
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    expect(currentPasswordInput).toBeRequired();
    expect(newPasswordInput).toBeRequired();
    expect(confirmPasswordInput).toBeRequired();
  });

  it('should show error when new password is too short', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'oldpass123');
    await user.type(newPasswordInput, 'short');
    await user.type(confirmPasswordInput, 'short');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('should show error when passwords do not match', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'oldpass123');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'different123');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    expect(screen.getByText('New passwords do not match')).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('should show error when new password is same as current password', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'password123');
    await user.type(newPasswordInput, 'password123');
    await user.type(confirmPasswordInput, 'password123');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    expect(
      screen.getByText('New password must be different from current password')
    ).toBeInTheDocument();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({});

    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'oldpassword123');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        oldPassword: 'oldpassword123',
        password: 'newpassword123',
        passwordConfirm: 'newpassword123',
      });
    });

    expect(mockSuccess).toHaveBeenCalledWith('Password changed successfully');
  });

  it('should clear form after successful submission', async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({});

    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password') as HTMLInputElement;
    const newPasswordInput = screen.getByLabelText('New Password') as HTMLInputElement;
    const confirmPasswordInput = screen.getByLabelText(
      'Confirm New Password'
    ) as HTMLInputElement;

    await user.type(currentPasswordInput, 'oldpassword123');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(currentPasswordInput.value).toBe('');
      expect(newPasswordInput.value).toBe('');
      expect(confirmPasswordInput.value).toBe('');
    });
  });

  it('should handle submission errors', async () => {
    const user = userEvent.setup();
    const errorMessage = 'Incorrect current password';
    mockMutateAsync.mockRejectedValue(new Error(errorMessage));

    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'wrongpassword');
    await user.type(newPasswordInput, 'newpassword123');
    await user.type(confirmPasswordInput, 'newpassword123');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    expect(mockError).toHaveBeenCalledWith(errorMessage);
  });

  it('should show loading state during submission', async () => {
    vi.spyOn(useChangePasswordModule, 'useChangePassword').mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: true,
    } as unknown as ReturnType<typeof useChangePasswordModule.useChangePassword>);

    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: /changing password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /changing password/i })).toBeDisabled();
  });

  it('should clear error when user starts typing', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />, { wrapper: createWrapper() });

    // Fill in form to trigger a different error (password too short)
    const currentPasswordInput = screen.getByLabelText('Current Password');
    const newPasswordInput = screen.getByLabelText('New Password');
    const confirmPasswordInput = screen.getByLabelText('Confirm New Password');

    await user.type(currentPasswordInput, 'oldpass');
    await user.type(newPasswordInput, 'short');
    await user.type(confirmPasswordInput, 'short');

    const submitButton = screen.getByRole('button', { name: /change password/i });
    await user.click(submitButton);

    expect(screen.getByText('New password must be at least 8 characters')).toBeInTheDocument();

    // Start typing in current password field
    await user.clear(currentPasswordInput);
    await user.type(currentPasswordInput, 'a');

    expect(
      screen.queryByText('New password must be at least 8 characters')
    ).not.toBeInTheDocument();
  });
});
