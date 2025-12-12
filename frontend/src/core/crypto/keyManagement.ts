/**
 * Key management for encrypted sessions
 *
 * Manages the decrypted private key in memory during an active encrypted session.
 * The private key is NEVER persisted to disk or localStorage.
 */

import type { EncryptedPrivateKey, EncryptionMetadata } from './types';
import {
  decryptPrivateKey,
  importPrivateKey,
  importPublicKey,
  verifyPassword,
} from './encryption';

/**
 * In-memory storage for the decrypted private key
 * This is cleared when the session ends or the page refreshes
 */
class KeyStore {
  private privateKey: CryptoKey | null = null;
  private publicKey: CryptoKey | null = null;
  private metadata: EncryptionMetadata | null = null;

  setKeys(privateKey: CryptoKey, publicKey: CryptoKey, metadata: EncryptionMetadata) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.metadata = metadata;
  }

  getPrivateKey(): CryptoKey | null {
    return this.privateKey;
  }

  getPublicKey(): CryptoKey | null {
    return this.publicKey;
  }

  getMetadata(): EncryptionMetadata | null {
    return this.metadata;
  }

  isUnlocked(): boolean {
    return this.privateKey !== null && this.publicKey !== null;
  }

  clear() {
    this.privateKey = null;
    this.publicKey = null;
    this.metadata = null;
  }
}

// Singleton instance
const keyStore = new KeyStore();

/**
 * Unlock the encryption session with a family password
 */
export async function unlockEncryption(
  metadata: EncryptionMetadata,
  password: string
): Promise<void> {
  // Verify password
  const isValid = await verifyPassword(password, metadata.passwordHash);
  if (!isValid) {
    throw new Error('Invalid password');
  }

  // Decrypt private key
  const encryptedPrivateKey: EncryptedPrivateKey = JSON.parse(
    metadata.encryptedPrivateKey
  );
  const privateKeyB64 = await decryptPrivateKey(encryptedPrivateKey, password);

  // Import keys
  const privateKey = await importPrivateKey(privateKeyB64);
  const publicKey = await importPublicKey(metadata.publicKey);

  // Store in memory
  keyStore.setKeys(privateKey, publicKey, metadata);
}

/**
 * Lock the encryption session (clear keys from memory)
 */
export function lockEncryption(): void {
  keyStore.clear();
}

/**
 * Check if encryption is currently unlocked
 */
export function isEncryptionUnlocked(): boolean {
  return keyStore.isUnlocked();
}

/**
 * Get the decrypted private key (if unlocked)
 */
export function getPrivateKey(): CryptoKey | null {
  return keyStore.getPrivateKey();
}

/**
 * Get the public key (if unlocked)
 */
export function getPublicKey(): CryptoKey | null {
  return keyStore.getPublicKey();
}

/**
 * Get the encryption metadata from the current session (if unlocked)
 * Use getEncryptionMetadata from api.ts to fetch from server
 */
export function getSessionMetadata(): EncryptionMetadata | null {
  return keyStore.getMetadata();
}
