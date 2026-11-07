/**
 * Text a person is in the middle of writing, kept on this device until it's
 * saved or thrown away — so closing the tab, a reload, or the phone locking
 * mid-sentence loses nothing, the way a native app's compose box behaves.
 *
 * Per person (keyed by the signed-in user), so a shared device never hands
 * one person's half-written text to another. Kept in localStorage: a draft is
 * a convenience on this device, not data — if storage is blocked (private
 * mode) it simply isn't kept.
 */

import { useCallback, useState } from 'react';
import { aepbase } from '../../api/aepbase';

const PREFIX = 'homestead.draft.';

function storageKey(key: string): string {
  return `${PREFIX}${aepbase.getCurrentUser()?.id ?? 'anon'}.${key}`;
}

/** The draft saved under `key` on this device, or '' when there's none. */
export function readDeviceDraft(key: string): string {
  try {
    return window.localStorage.getItem(storageKey(key)) ?? '';
  } catch {
    return '';
  }
}

/** Save (or, with '', forget) the draft under `key` on this device. */
export function writeDeviceDraft(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(storageKey(key), value);
    else window.localStorage.removeItem(storageKey(key));
  } catch {
    // Storage blocked: the draft just isn't kept across reloads.
  }
}

/**
 * `[draft, setDraft]` for the text under `key` (e.g. `notes.compose`, or
 * `notes.edit.<id>`): read from the device once, saved on every change, and
 * forgotten by setting it to ''.
 */
export function useDeviceDraft(key: string): [string, (value: string) => void] {
  const [draft, setDraftState] = useState(() => readDeviceDraft(key));
  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      writeDeviceDraft(key, value);
    },
    [key],
  );
  return [draft, setDraft];
}
