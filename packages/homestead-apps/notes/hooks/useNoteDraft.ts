import { useCallback, useState } from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';

function draftKey(): string {
  return `homestead.notes.draft.${aepbase.getCurrentUser()?.id ?? 'anon'}`;
}

function readDraft(): string {
  try {
    return window.localStorage.getItem(draftKey()) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(value: string): void {
  try {
    if (value) window.localStorage.setItem(draftKey(), value);
    else window.localStorage.removeItem(draftKey());
  } catch {
    // Storage blocked (private mode): the draft just isn't kept across reloads.
  }
}

/**
 * The composer's text, kept on this device until it's saved, so a half-written
 * note survives closing the tab or the phone locking. Per person, so a shared
 * device doesn't hand one person's draft to another.
 */
export function useNoteDraft(): [string, (value: string) => void] {
  const [draft, setDraftState] = useState(readDraft);
  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    writeDraft(value);
  }, []);
  return [draft, setDraft];
}
