/**
 * Hook for accessing encrypted session context
 */

import { useContext } from 'react';
import { EncryptedSessionContext } from './encryptedSessionContext';

export function useEncryptedSession() {
  const context = useContext(EncryptedSessionContext);
  if (!context) {
    throw new Error('useEncryptedSession must be used within EncryptedSessionProvider');
  }
  return context;
}
