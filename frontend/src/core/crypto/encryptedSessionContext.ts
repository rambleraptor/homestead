/**
 * Encrypted Session Context
 *
 * Context for managing encrypted session state
 */

import { createContext } from 'react';
import type { EncryptionMetadata } from './types';

export interface EncryptedSessionContextValue {
  isUnlocked: boolean;
  metadata: EncryptionMetadata | null;
  unlockEncryption: (metadata: EncryptionMetadata, password: string) => Promise<void>;
  lockEncryption: () => void;
  getPrivateKey: () => CryptoKey | null;
  getPublicKey: () => CryptoKey | null;
}

export const EncryptedSessionContext = createContext<EncryptedSessionContextValue | null>(null);
