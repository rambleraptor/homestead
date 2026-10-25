import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { getTodaysHoliday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';

/** "Good morning" before noon, "Good afternoon" until six, "Good evening" after. */
export function partOfDay(at: Date = new Date()): string {
  const hour = at.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** The home's greeting, in the person's local time. A holiday wins. */
export function useGreeting(): string {
  const { user } = useAuth();
  const holiday = getTodaysHoliday();
  if (holiday) return holiday.message;
  const part = partOfDay();
  return user?.name ? `${part}, ${user.name}` : part;
}
