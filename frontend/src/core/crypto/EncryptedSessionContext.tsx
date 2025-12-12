/**
 * Encrypted Session Context
 *
 * Manages the "encrypted-friendly" session state where the user has unlocked
 * encryption by providing the family password. The decrypted private key is
 * kept in memory for the duration of the session.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { EncryptionMetadata } from './types';
import {
  unlockEncryption as unlockEncryptionImpl,
  lockEncryption as lockEncryptionImpl,
  isEncryptionUnlocked,
  getPrivateKey,
  getPublicKey,
} from './keyManagement';

interface EncryptedSessionContextValue {
  isUnlocked: boolean;
  metadata: EncryptionMetadata | null;
  unlockEncryption: (metadata: EncryptionMetadata, password: string) => Promise<void>;
  lockEncryption: () => void;
  getPrivateKey: () => CryptoKey | null;
  getPublicKey: () => CryptoKey | null;
}

const EncryptedSessionContext = createContext<EncryptedSessionContextValue | null>(null);

export function EncryptedSessionProvider({ children }: { children: React.ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [metadata, setMetadata] = useState<EncryptionMetadata | null>(null);

  // Sync with key store on mount
  useEffect(() => {
    setIsUnlocked(isEncryptionUnlocked());
  }, []);

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

export function useEncryptedSession() {
  const context = useContext(EncryptedSessionContext);
  if (!context) {
    throw new Error('useEncryptedSession must be used within EncryptedSessionProvider');
  }
  return context;
}
