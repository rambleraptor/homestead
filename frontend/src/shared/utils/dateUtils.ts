/**
 * Date formatting and manipulation utilities
 */

export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateString);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString('en-US', options || defaultOptions);
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
  return `${Math.floor(diffInDays / 365)} years ago`;
}

export function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

export function isSameDay(date1: string | Date, date2: string | Date): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

/**
 * Get the next occurrence of an annual date (like a birthday or anniversary)
 * @param date The original date
 * @returns The next occurrence of this date (this year or next year)
 */
export function getNextOccurrence(date: Date): Date {
  const now = new Date();
  let nextOccurrence = new Date(
    now.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  // If the date has already passed this year, use next year
  if (nextOccurrence < now) {
    nextOccurrence = new Date(
      now.getFullYear() + 1,
      date.getMonth(),
      date.getDate()
    );
  }

  return nextOccurrence;
}

/**
 * Check if a date occurs within the specified number of days from now
 * @param date The date to check
 * @param days Number of days to look ahead (default: 30)
 * @returns True if the next occurrence is within the specified days
 */
export function isUpcoming(date: Date, days: number = 30): boolean {
  const nextOccurrence = getNextOccurrence(date);
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + days);

  return nextOccurrence >= now && nextOccurrence <= futureDate;
}

/**
 * Calculate the number of days until the next occurrence of a date
 * @param date The date to check
 * @returns Number of days until the next occurrence
 */
export function getDaysUntil(date: Date): number {
  const now = new Date();
  const nextOccurrence = getNextOccurrence(date);
  const diffTime = nextOccurrence.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Sort items by their upcoming date (soonest first)
 * @param items Array of items
 * @param dateGetter Function to extract date from item
 * @returns Sorted array
 */
export function sortByUpcoming<T>(
  items: T[],
  dateGetter: (item: T) => Date | null
): T[] {
  return [...items].sort((a, b) => {
    const dateA = dateGetter(a);
    const dateB = dateGetter(b);

    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;

    const nextA = getNextOccurrence(dateA);
    const nextB = getNextOccurrence(dateB);

    return nextA.getTime() - nextB.getTime();
  });
}

/**
 * Get upcoming events from a date (birthday and/or anniversary)
 * within the specified number of days
 * @param birthday Birthday date or null
 * @param anniversary Anniversary date or null
 * @param days Number of days to look ahead (default: 30)
 * @returns Array of upcoming events with type and date
 */
export function getUpcomingEvents(
  birthday: string | null,
  anniversary: string | null,
  days: number = 30
): Array<{ type: 'Birthday' | 'Anniversary'; date: Date }> {
  const events: Array<{ type: 'Birthday' | 'Anniversary'; date: Date }> = [];
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + days);

  if (birthday) {
    const birthdayDate = new Date(birthday);
    const nextBirthday = getNextOccurrence(birthdayDate);
    if (nextBirthday >= now && nextBirthday <= futureDate) {
      events.push({ type: 'Birthday', date: nextBirthday });
    }
  }

  if (anniversary) {
    const anniversaryDate = new Date(anniversary);
    const nextAnniversary = getNextOccurrence(anniversaryDate);
    if (nextAnniversary >= now && nextAnniversary <= futureDate) {
      events.push({ type: 'Anniversary', date: nextAnniversary });
    }
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
