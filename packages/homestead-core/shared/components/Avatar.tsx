/**
 * A person as a circle of initials, for anywhere people are listed by name.
 * The hue is a stable hash of the name, so the same person looks the same on
 * every screen and a list of people reads as people rather than as rows. It's
 * decoration for a name that is always printed beside it: hidden from
 * assistive tech, with the name as a tooltip.
 */

import type { CSSProperties } from 'react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
  /** For a `viewTransitionName`, so a list's avatar morphs into a page's. */
  style?: CSSProperties;
}

/** Soft backgrounds with dark text of the same hue: readable in a 24px circle. */
const HUES = [
  'bg-rose-100 text-rose-800',
  'bg-orange-100 text-orange-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-indigo-100 text-indigo-800',
  'bg-violet-100 text-violet-800',
] as const;

const SIZES: Record<AvatarSize, string> = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-14 text-xl',
};

/** The first letter of the first two words, uppercase; one letter for a single word. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return words.map((w) => [...w][0]!.toUpperCase()).join('') || '?';
}

/** A stable index into `HUES` for a name (djb2). */
export function hueIndexOf(name: string, hues = HUES.length): number {
  let hash = 5381;
  for (const ch of name.trim().toLowerCase()) hash = ((hash << 5) + hash + ch.codePointAt(0)!) | 0;
  return Math.abs(hash) % hues;
}

export function Avatar({ name, size = 'md', className, style }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      title={name}
      style={style}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-semibold leading-none',
        HUES[hueIndexOf(name)],
        SIZES[size],
        className,
      )}
      data-testid="avatar"
    >
      {initialsOf(name)}
    </span>
  );
}
