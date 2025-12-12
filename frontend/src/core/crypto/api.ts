/**
 * API helpers for encrypted fields
 *
 * Functions to interact with PocketBase for encryption metadata
 * and to bootstrap the encryption system.
 */

import { getCollection, Collections } from '../api/pocketbase';
import type { EncryptionMetadata, EncryptedPrivateKey } from './types';
import {
  generateKeyPair,
  exportKeyPair,
  encryptPrivateKey,
  hashPassword,
  changePassword,
} from './encryption';

/**
 * Check if encryption has been bootstrapped
 */
export async function isEncryptionBootstrapped(): Promise<boolean> {
  try {
    const collection = getCollection<EncryptionMetadata>(Collections.ENCRYPTION_METADATA);
    const records = await collection.getFullList();
    return records.length > 0;
  } catch (error) {
    console.error('Failed to check encryption bootstrap status:', error);
    return false;
  }
}

/**
 * Get encryption metadata from the server
 */
export async function getEncryptionMetadata(): Promise<EncryptionMetadata | null> {
  try {
    const collection = getCollection<EncryptionMetadata>(Collections.ENCRYPTION_METADATA);
    const records = await collection.getFullList();

    if (records.length === 0) {
      return null;
    }

    // Should only be one record
    return records[0];
  } catch (error) {
    console.error('Failed to fetch encryption metadata:', error);
    return null;
  }
}

/**
 * Bootstrap the encryption system with a family password
 * This should only be called once to set up the initial encryption.
 */
export async function bootstrapEncryption(
  familyPassword: string
): Promise<EncryptionMetadata> {
  // Check if already bootstrapped
  const isBootstrapped = await isEncryptionBootstrapped();
  if (isBootstrapped) {
    throw new Error('Encryption is already bootstrapped');
  }

  // Generate key pair
  const keyPair = await generateKeyPair();
  const exportedKeys = await exportKeyPair(keyPair);

  // Encrypt private key with family password
  const encryptedPrivateKey = await encryptPrivateKey(
    exportedKeys.privateKey,
    familyPassword
  );

  // Hash the password for verification
  const passwordHash = await hashPassword(familyPassword);

  // Create metadata record
  const collection = getCollection<EncryptionMetadata>(Collections.ENCRYPTION_METADATA);
  const metadata = await collection.create({
    publicKey: exportedKeys.publicKey,
    encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
    passwordHash,
  });

  return metadata;
}

/**
 * Change the family password
 * Requires the current password to decrypt the private key, then re-encrypts with the new password.
 */
export async function changeFamilyPassword(
  currentPassword: string,
  newPassword: string
): Promise<EncryptionMetadata> {
  const metadata = await getEncryptionMetadata();
  if (!metadata) {
    throw new Error('Encryption has not been bootstrapped yet');
  }

  // Parse encrypted private key
  const encryptedPrivateKey: EncryptedPrivateKey = JSON.parse(
    metadata.encryptedPrivateKey
  );

  // Change password (decrypt with old, re-encrypt with new)
  const newEncryptedPrivateKey = await changePassword(
    encryptedPrivateKey,
    currentPassword,
    newPassword
  );

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Update metadata
  const collection = getCollection<EncryptionMetadata>(Collections.ENCRYPTION_METADATA);
  const updatedMetadata = await collection.update(metadata.id!, {
    encryptedPrivateKey: JSON.stringify(newEncryptedPrivateKey),
    passwordHash: newPasswordHash,
  });

  return updatedMetadata;
}
