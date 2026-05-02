/**
 * Change the current user's password.
 *
 * aepbase has no dedicated change-password endpoint, but `PATCH /users/{id}`
 * accepts a `password` field and bcrypt-hashes it server-side. To preserve
 * the "old password required" security property we first re-authenticate
 * via `POST /users/:login` with the current password; only on success do we
 * patch in the new one.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

export interface ChangePasswordData {
  oldPassword: string;
  password: string;
  passwordConfirm: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePasswordData) => {
      if (data.password !== data.passwordConfirm) {
        throw new Error('New password and confirmation do not match');
      }
      const user = aepbase.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // Verify the current password by re-logging in. Throws on mismatch.
      await aepbase.login(user.email, data.oldPassword);

      // Update the password. aepbase hashes server-side.
      const updated = await aepbase.update('users', user.id, {
        password: data.password,
      });
      return updated;
    },
  });
}
