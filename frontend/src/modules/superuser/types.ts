import type { UserType } from '@/core/auth/types';

export interface ManagedUser {
  id: string;
  email: string;
  display_name?: string;
  type?: UserType;
  create_time?: string;
  update_time?: string;
}

export interface UserFormData {
  email: string;
  display_name: string;
  type: UserType;
  password?: string;
}
