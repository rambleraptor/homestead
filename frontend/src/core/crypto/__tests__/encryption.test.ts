/**
 * Tests for encryption utilities
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPair,
  exportKeyPair,
  importPublicKey,
  importPrivateKey,
  hashPassword,
  encryptPrivateKey,
  decryptPrivateKey,
  encryptField,
  decryptField,
  changePassword,
  verifyPassword,
} from '../encryption';
import type { KeyPair, EncryptedPrivateKey } from '../types';

describe('Encryption Utilities', () => {
  let keyPair: KeyPair;
  let exportedPublicKey: string;
  let exportedPrivateKey: string;

  beforeAll(async () => {
    // Generate a key pair for testing
    keyPair = await generateKeyPair();
    const exported = await exportKeyPair(keyPair);
    exportedPublicKey = exported.publicKey;
    exportedPrivateKey = exported.privateKey;
  });

  describe('Key Generation and Export/Import', () => {
    it('should generate a valid RSA key pair', async () => {
      const newKeyPair = await generateKeyPair();
      expect(newKeyPair.publicKey).toBeDefined();
      expect(newKeyPair.privateKey).toBeDefined();
      expect(newKeyPair.publicKey.type).toBe('public');
      expect(newKeyPair.privateKey.type).toBe('private');
    });

    it('should export and import public key correctly', async () => {
      const importedPublicKey = await importPublicKey(exportedPublicKey);
      expect(importedPublicKey).toBeDefined();
      expect(importedPublicKey.type).toBe('public');
    });

    it('should export and import private key correctly', async () => {
      const importedPrivateKey = await importPrivateKey(exportedPrivateKey);
      expect(importedPrivateKey).toBeDefined();
      expect(importedPrivateKey.type).toBe('private');
    });

    it('should generate different key pairs each time', async () => {
      const keyPair1 = await generateKeyPair();
      const keyPair2 = await generateKeyPair();
      const exported1 = await exportKeyPair(keyPair1);
      const exported2 = await exportKeyPair(keyPair2);
      expect(exported1.publicKey).not.toBe(exported2.publicKey);
      expect(exported1.privateKey).not.toBe(exported2.privateKey);
    });
  });

  describe('Password Hashing and Verification', () => {
    it('should hash a password', async () => {
      const password = 'test-password-123';
      const hash = await hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
      // Should be valid JSON with hash and salt
      const parsed = JSON.parse(hash);
      expect(parsed.hash).toBeDefined();
      expect(parsed.salt).toBeDefined();
    });

    it('should produce different hashes for the same password (different salts)', async () => {
      const password = 'test-password-123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      // Different salts mean different hashes
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different passwords', async () => {
      const hash1 = await hashPassword('password1');
      const hash2 = await hashPassword('password2');
      expect(hash1).not.toBe(hash2);
    });

    it('should verify correct password', async () => {
      const password = 'test-password-123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'test-password-123';
      const hash = await hashPassword(password);
      const isValid = await verifyPassword('wrong-password', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('Private Key Encryption/Decryption', () => {
    it('should encrypt and decrypt private key with password', async () => {
      const password = 'family-password-123';
      const encrypted = await encryptPrivateKey(exportedPrivateKey, password);

      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      const decrypted = await decryptPrivateKey(encrypted, password);
      expect(decrypted).toBe(exportedPrivateKey);
    });

    it('should fail to decrypt with wrong password', async () => {
      const password = 'family-password-123';
      const encrypted = await encryptPrivateKey(exportedPrivateKey, password);

      await expect(
        decryptPrivateKey(encrypted, 'wrong-password')
      ).rejects.toThrow('Failed to decrypt private key');
    });

    it('should use different salts for each encryption', async () => {
      const password = 'family-password-123';
      const encrypted1 = await encryptPrivateKey(exportedPrivateKey, password);
      const encrypted2 = await encryptPrivateKey(exportedPrivateKey, password);

      expect(encrypted1.salt).not.toBe(encrypted2.salt);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
    });
  });

  describe('Field Encryption/Decryption', () => {
    it('should encrypt and decrypt a field value', async () => {
      const testValue = 'Secret Information 123!';
      const encrypted = await encryptField(testValue, keyPair.publicKey);

      expect(encrypted.encryptedKey).toBeDefined();
      expect(encrypted.encryptedData).toBeDefined();
      expect(encrypted.iv).toBeDefined();

      const decrypted = await decryptField(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(testValue);
    });

    it('should handle empty strings', async () => {
      const testValue = '';
      const encrypted = await encryptField(testValue, keyPair.publicKey);
      const decrypted = await decryptField(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(testValue);
    });

    it('should handle special characters', async () => {
      const testValue = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
      const encrypted = await encryptField(testValue, keyPair.publicKey);
      const decrypted = await decryptField(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(testValue);
    });

    it('should handle unicode characters', async () => {
      const testValue = '你好世界 🌍 مرحبا العالم';
      const encrypted = await encryptField(testValue, keyPair.publicKey);
      const decrypted = await decryptField(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(testValue);
    });

    it('should handle long text beyond RSA-OAEP limits using hybrid encryption', async () => {
      // With hybrid encryption, we can encrypt data much larger than RSA-OAEP's
      // ~190 byte limit. Test with 1000+ characters to prove it works.
      const testValue = 'A'.repeat(1000) + ' This is a very long encrypted message! ' + 'B'.repeat(500);
      const encrypted = await encryptField(testValue, keyPair.publicKey);
      const decrypted = await decryptField(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(testValue);
      expect(testValue.length).toBeGreaterThan(1000); // Verify we're testing with large data
    });

    it('should fail to decrypt with wrong private key', async () => {
      const testValue = 'Secret Information';
      const encrypted = await encryptField(testValue, keyPair.publicKey);

      // Generate a different key pair
      const wrongKeyPair = await generateKeyPair();

      await expect(
        decryptField(encrypted, wrongKeyPair.privateKey)
      ).rejects.toThrow('Failed to decrypt field value');
    });
  });

  describe('Password Change', () => {
    let encryptedPrivateKey: EncryptedPrivateKey;
    const oldPassword = 'old-password-123';
    const newPassword = 'new-password-456';

    beforeAll(async () => {
      encryptedPrivateKey = await encryptPrivateKey(exportedPrivateKey, oldPassword);
    });

    it('should change password successfully', async () => {
      const reEncrypted = await changePassword(
        encryptedPrivateKey,
        oldPassword,
        newPassword
      );

      // Should decrypt with new password
      const decrypted = await decryptPrivateKey(reEncrypted, newPassword);
      expect(decrypted).toBe(exportedPrivateKey);

      // Should NOT decrypt with old password
      await expect(
        decryptPrivateKey(reEncrypted, oldPassword)
      ).rejects.toThrow();
    });

    it('should fail with wrong old password', async () => {
      await expect(
        changePassword(encryptedPrivateKey, 'wrong-password', newPassword)
      ).rejects.toThrow('Failed to decrypt private key');
    });
  });

  describe('End-to-End Flow', () => {
    it('should complete full encryption workflow', async () => {
      // 1. Generate key pair
      const newKeyPair = await generateKeyPair();
      const exported = await exportKeyPair(newKeyPair);

      // 2. Encrypt private key with family password
      const familyPassword = 'my-family-password';
      const encryptedPrivateKey = await encryptPrivateKey(
        exported.privateKey,
        familyPassword
      );

      // 3. Hash password for storage
      const passwordHash = await hashPassword(familyPassword);

      // 4. Simulate storing and retrieving from database
      const storedData = {
        publicKey: exported.publicKey,
        encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
        passwordHash,
      };

      // 5. Verify password
      const isValid = await verifyPassword(familyPassword, storedData.passwordHash);
      expect(isValid).toBe(true);

      // 6. Decrypt private key
      const parsedEncryptedKey: EncryptedPrivateKey = JSON.parse(
        storedData.encryptedPrivateKey
      );
      const decryptedPrivateKeyB64 = await decryptPrivateKey(
        parsedEncryptedKey,
        familyPassword
      );

      // 7. Import keys
      const publicKey = await importPublicKey(storedData.publicKey);
      const privateKey = await importPrivateKey(decryptedPrivateKeyB64);

      // 8. Encrypt a field
      const secretData = 'My secret data';
      const encryptedField = await encryptField(secretData, publicKey);

      // 9. Decrypt the field
      const decryptedData = await decryptField(encryptedField, privateKey);
      expect(decryptedData).toBe(secretData);
    });
  });
});
