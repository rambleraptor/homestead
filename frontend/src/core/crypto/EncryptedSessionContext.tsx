/**
 * Encrypted Session Context
 *
 * Manages the "encrypted-friendly" session state where the user has unlocked
 * encryption by providing the family password. The decrypted private key is
 * kept in memory for the duration of the session.
 */

import React, { useState, useCallback } from 'react';
import type { EncryptionMetadata } from './types';
import {
  unlockEncryption as unlockEncryptionImpl,
  lockEncryption as lockEncryptionImpl,
  isEncryptionUnlocked,
  getPrivateKey,
  getPublicKey,
} from './keyManagement';
import { EncryptedSessionContext } from './encryptedSessionContext';

export function EncryptedSessionProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(() => isEncryptionUnlocked());
  const [metadata, setMetadata] = useState<EncryptionMetadata | null>(null);

  const unlockEncryption = useCallback(
    async (metadata: EncryptionMetadata, password: string) => {
      await unlockEncryptionImpl(metadata, password);
      setIsUnlocked(true);
      setMetadata(metadata);
    },
    []
  );

  const lockEncryption = useCallback(() => {
    lockEncryptionImpl();
    setIsUnlocked(false);
    setMetadata(null);
  }, []);

  return (
    <EncryptedSessionContext.Provider
      value={{
        isUnlocked,
        metadata,
        unlockEncryption,
        lockEncryption,
        getPrivateKey,
        getPublicKey,
      }}
    >
      {children}
    </EncryptedSessionContext.Provider>
  );
}
