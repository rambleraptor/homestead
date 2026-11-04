/**
 * Whether a document's stored file is encrypted at rest.
 *
 * The signal is per-document, not per-instance: turning encryption on encrypts
 * only new writes, so documents uploaded beforehand stay plaintext until they're
 * rewritten (see SECURITY.md). "Not encrypted" is styled as neutral information
 * rather than a warning — an operator may deliberately run without a master key.
 */

import { Lock, LockOpen } from 'lucide-react';

export function DocumentEncryptionBadge({ encrypted }: { encrypted: boolean }) {
  const Icon = encrypted ? Lock : LockOpen;
  const className = encrypted ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-text-muted';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs ${className}`}
      data-testid="document-encryption"
      data-encrypted={encrypted}
    >
      <Icon className="h-3 w-3" />
      {encrypted ? 'Encrypted' : 'Not encrypted'}
    </span>
  );
}
