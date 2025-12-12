/**
 * Tests for key management utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  unlockEncryption,
  lockEncryption,
  isEncryptionUnlocked,
  getPrivateKey,
  getPublicKey,
  getEncryptionMetadata,
} from '../keyManagement';
import {
  generateKeyPair,
  exportKeyPair,
  encryptPrivateKey,
  hashPassword,
} from '../encryption';
import type { EncryptionMetadata } from '../types';

describe('Key Management', () => {
  let testMetadata: EncryptionMetadata;
  const testPassword = 'test-family-password';

  beforeEach(async () => {
    // Generate test metadata
    const keyPair = await generateKeyPair();
    const exported = await exportKeyPair(keyPair);
    const encryptedPrivateKey = await encryptPrivateKey(
      exported.privateKey,
      testPassword
    );
    const passwordHash = await hashPassword(testPassword);

    testMetadata = {
      id: 'test-id',
      publicKey: exported.publicKey,
      encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
      passwordHash,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    };
  });

  afterEach(() => {
    // Clean up after each test
    lockEncryption();
  });

  describe('Unlock/Lock Operations', () => {
    it('should start in locked state', () => {
      expect(isEncryptionUnlocked()).toBe(false);
    });

    it('should unlock with correct password', async () => {
      await unlockEncryption(testMetadata, testPassword);
      expect(isEncryptionUnlocked()).toBe(true);
    });

    it('should fail to unlock with incorrect password', async () => {
      await expect(
        unlockEncryption(testMetadata, 'wrong-password')
      ).rejects.toThrow('Invalid password');

      expect(isEncryptionUnlocked()).toBe(false);
    });

    it('should lock encryption', async () => {
      await unlockEncryption(testMetadata, testPassword);
      expect(isEncryptionUnlocked()).toBe(true);

      lockEncryption();
      expect(isEncryptionUnlocked()).toBe(false);
    });

    it('should clear keys when locked', async () => {
      await unlockEncryption(testMetadata, testPassword);
      expect(getPrivateKey()).not.toBeNull();
      expect(getPublicKey()).not.toBeNull();

      lockEncryption();
      expect(getPrivateKey()).toBeNull();
      expect(getPublicKey()).toBeNull();
    });
  });

  describe('Key Access', () => {
    it('should return null keys when locked', () => {
      expect(getPrivateKey()).toBeNull();
      expect(getPublicKey()).toBeNull();
      expect(getEncryptionMetadata()).toBeNull();
    });

    it('should return keys when unlocked', async () => {
      await unlockEncryption(testMetadata, testPassword);

      const privateKey = getPrivateKey();
      const publicKey = getPublicKey();
      const metadata = getEncryptionMetadata();

      expect(privateKey).not.toBeNull();
      expect(publicKey).not.toBeNull();
      expect(metadata).toEqual(testMetadata);

      expect(privateKey?.type).toBe('private');
      expect(publicKey?.type).toBe('public');
    });

    it('should return same key instances on multiple calls', async () => {
      await unlockEncryption(testMetadata, testPassword);

      const privateKey1 = getPrivateKey();
      const privateKey2 = getPrivateKey();
      const publicKey1 = getPublicKey();
      const publicKey2 = getPublicKey();

      expect(privateKey1).toBe(privateKey2);
      expect(publicKey1).toBe(publicKey2);
    });
  });

  describe('Multiple Unlock/Lock Cycles', () => {
    it('should handle multiple unlock/lock cycles', async () => {
      // First cycle
      await unlockEncryption(testMetadata, testPassword);
      expect(isEncryptionUnlocked()).toBe(true);
      lockEncryption();
      expect(isEncryptionUnlocked()).toBe(false);

      // Second cycle
      await unlockEncryption(testMetadata, testPassword);
      expect(isEncryptionUnlocked()).toBe(true);
      lockEncryption();
      expect(isEncryptionUnlocked()).toBe(false);

      // Third cycle
      await unlockEncryption(testMetadata, testPassword);
      expect(isEncryptionUnlocked()).toBe(true);
    });
  });

  describe('Security', () => {
    it('should not expose private key in memory after lock', async () => {
      await unlockEncryption(testMetadata, testPassword);
      const privateKey = getPrivateKey();
      expect(privateKey).not.toBeNull();

      lockEncryption();

      // Private key should be cleared
      const privateKeyAfterLock = getPrivateKey();
      expect(privateKeyAfterLock).toBeNull();

      // Original reference should still exist (JS can't truly clear it)
      // but the key store should return null
      expect(privateKey).not.toBeNull(); // Original reference
      expect(privateKeyAfterLock).toBeNull(); // New retrieval
    });

    it('should handle invalid metadata gracefully', async () => {
      const invalidMetadata = {
        ...testMetadata,
        encryptedPrivateKey: 'invalid-json',
      };

      await expect(
        unlockEncryption(invalidMetadata, testPassword)
      ).rejects.toThrow();

      expect(isEncryptionUnlocked()).toBe(false);
    });
  });
});
