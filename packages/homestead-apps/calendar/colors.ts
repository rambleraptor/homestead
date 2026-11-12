/**
 * How each calendar colour is drawn. The stored value is a name
 * (`resources.ts`), so the palette can be retuned here without touching data.
 * Whole class strings, never assembled, so Tailwind can see them.
 */

import type { CalendarColor } from './types';

interface ColorClasses {
  /** The solid dot / swatch. */
  dot: string;
  /** An event chip: tinted background, readable text, a solid leading edge. */
  chip: string;
}

const CLASSES: Record<CalendarColor, ColorClasses> = {
  blue: { dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-900 border-blue-500' },
  green: { dot: 'bg-green-500', chip: 'bg-green-100 text-green-900 border-green-500' },
  red: { dot: 'bg-red-500', chip: 'bg-red-100 text-red-900 border-red-500' },
  orange: { dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-900 border-orange-500' },
  purple: { dot: 'bg-purple-500', chip: 'bg-purple-100 text-purple-900 border-purple-500' },
  pink: { dot: 'bg-pink-500', chip: 'bg-pink-100 text-pink-900 border-pink-500' },
  teal: { dot: 'bg-teal-500', chip: 'bg-teal-100 text-teal-900 border-teal-500' },
  yellow: { dot: 'bg-yellow-500', chip: 'bg-yellow-100 text-yellow-900 border-yellow-500' },
  gray: { dot: 'bg-gray-500', chip: 'bg-gray-100 text-gray-900 border-gray-500' },
};

/** Classes for a colour; an unknown value off the wire falls back to gray. */
export function colorClasses(color: string | undefined): ColorClasses {
  return CLASSES[color as CalendarColor] ?? CLASSES.gray;
}

export const COLOR_LABELS: Record<CalendarColor, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  orange: 'Orange',
  purple: 'Purple',
  pink: 'Pink',
  teal: 'Teal',
  yellow: 'Yellow',
  gray: 'Gray',
};
