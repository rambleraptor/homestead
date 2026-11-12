import {
  readDeviceDraft,
  useDeviceDraft,
} from '@rambleraptor/homestead-core/shared/hooks/useDeviceDraft';
import { VISIBILITY_DRAFT } from '../bookmarks';
import { VISIBILITY_HOUSEHOLD, VISIBILITY_PRIVATE } from '../resources';
import type { BookmarkVisibility } from '../types';

function asVisibility(stored: string): BookmarkVisibility {
  return stored === VISIBILITY_HOUSEHOLD ? VISIBILITY_HOUSEHOLD : VISIBILITY_PRIVATE;
}

/**
 * Who the next link is saved for, remembered on this device: someone who
 * mostly saves for the family shouldn't have to say so each time. Private
 * until they choose otherwise.
 */
export function useSaveVisibility(): [BookmarkVisibility, (value: string) => void] {
  const [stored, setStored] = useDeviceDraft(VISIBILITY_DRAFT);
  return [asVisibility(stored), setStored];
}

/**
 * The remembered choice, read at the moment of saving — for a save with no
 * form to ask in (a link shared from another app).
 */
export function rememberedVisibility(): BookmarkVisibility {
  return asVisibility(readDeviceDraft(VISIBILITY_DRAFT));
}
