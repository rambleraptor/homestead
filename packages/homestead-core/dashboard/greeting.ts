import { useAuth } from '@rambleraptor/homestead-core/auth/useAuth';
import { getTodaysHoliday } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';

/**
 * The dashboard's headline greeting. A holiday wins; otherwise a first visit
 * (the welcome guide still showing) is greeted rather than welcomed "back".
 */
export function useGreeting(): { greeting: string; isFirstRun: boolean } {
  const { user } = useAuth();
  const { value: showWelcomeGuide } = useUserSetting<boolean>('dashboard', 'show_welcome_guide');
  const isFirstRun = showWelcomeGuide !== false;
  const holiday = getTodaysHoliday();
  const name = user?.name;
  const greeting = holiday
    ? holiday.message
    : isFirstRun
      ? name
        ? `Welcome, ${name}`
        : 'Welcome'
      : name
        ? `Welcome back, ${name}`
        : 'Welcome back';
  return { greeting, isFirstRun };
}
