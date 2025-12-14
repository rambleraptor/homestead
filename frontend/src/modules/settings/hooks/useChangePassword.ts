import { useMutation } from '@tanstack/react-query';
import { pb, Collections } from '@/core/api/pocketbase';

export interface ChangePasswordData {
  oldPassword: string;
  password: string;
  passwordConfirm: string;
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: ChangePasswordData) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      // PocketBase requires oldPassword, password, and passwordConfirm
      return await pb.collection(Collections.USERS).update(userId, {
        oldPassword: data.oldPassword,
        password: data.password,
        passwordConfirm: data.passwordConfirm,
      });
    },
  });
}
