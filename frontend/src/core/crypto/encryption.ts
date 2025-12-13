/**
 * Core encryption utilities for encrypted fields feature
 *
 * Uses Web Crypto API for all cryptographic operations:
 * - RSA-OAEP for asymmetric encryption (field data)
 * - AES-GCM for symmetric encryption (private key protection)
 * - PBKDF2 for password derivation
 * - SHA-256 for password hashing
 */

import type {
  KeyPair,
  ExportedKeyPair,
  EncryptedPrivateKey,
  EncryptedFieldValue,
} from './types';

// Constants
const RSA_KEY_SIZE = 2048;
const AES_KEY_SIZE = 256;
const PBKDF2_ITERATIONS = 100000;
const SALT_SIZE = 16;
const IV_SIZE = 12;

/**
 * Generate a new RSA key pair for field encryption/decryption
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: RSA_KEY_SIZE,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  return keyPair;
}

/**
 * Export a key pair to a transferable format (JWK as base64)
 */
export async function exportKeyPair(keyPair: KeyPair): Promise<ExportedKeyPair> {
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKey: btoa(JSON.stringify(publicKeyJwk)),
    privateKey: btoa(JSON.stringify(privateKeyJwk)),
  };
}

/**
 * Import a public key from base64 JWK format
 */
export async function importPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  const publicKeyJwk = JSON.parse(atob(publicKeyB64));

  return await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

/**
 * Import a private key from base64 JWK format
 */
export async function importPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const privateKeyJwk = JSON.parse(atob(privateKeyB64));

  return await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );
}

/**
 * Hash a password using PBKDF2 for secure verification
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  const passwordHash: import('./types').PasswordHash = {
    hash: arrayBufferToBase64(hashBits),
    salt: arrayBufferToBase64(salt.buffer),
  };

  return JSON.stringify(passwordHash);
}

/**
 * Derive an AES key from a password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: BufferSource
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_SIZE,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt the private key with a family password
 */
export async function encryptPrivateKey(
  privateKeyB64: string,
  password: string
): Promise<EncryptedPrivateKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  const aesKey = await deriveKeyFromPassword(password, salt);

  const encoder = new TextEncoder();
  const privateKeyData = encoder.encode(privateKeyB64);

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    privateKeyData
  );

  return {
    encryptedData: arrayBufferToBase64(encryptedData),
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt the private key using the family password
 */
export async function decryptPrivateKey(
  encryptedPrivateKey: EncryptedPrivateKey,
  password: string
): Promise<string> {
  const salt = base64ToArrayBuffer(encryptedPrivateKey.salt);
  const iv = base64ToArrayBuffer(encryptedPrivateKey.iv);
  const encryptedData = base64ToArrayBuffer(encryptedPrivateKey.encryptedData);

  const aesKey = await deriveKeyFromPassword(password, new Uint8Array(salt));

  try {
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      aesKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch {
    throw new Error('Failed to decrypt private key. Invalid password?');
  }
}

/**
 * Encrypt a field value using hybrid encryption (RSA-OAEP + AES-GCM)
 *
 * This avoids RSA-OAEP's message size limitation by:
 * 1. Generating a random AES-256 key
 * 2. Encrypting the data with AES-GCM
 * 3. Encrypting the AES key with RSA-OAEP
 */
export async function encryptField(
  value: string,
  publicKey: CryptoKey
): Promise<EncryptedFieldValue> {
  // Generate random AES key
  const aesKey = await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: AES_KEY_SIZE,
    },
    true,
    ['encrypt']
  );

  // Export AES key for encryption with RSA
  const aesKeyData = await crypto.subtle.exportKey('raw', aesKey);

  // Encrypt AES key with RSA-OAEP
  const encryptedKey = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    aesKeyData
  );

  // Generate IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  // Encrypt data with AES-GCM
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    data
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKey),
    encryptedData: arrayBufferToBase64(encryptedData),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a field value using hybrid decryption (RSA-OAEP + AES-GCM)
 *
 * Reverses the hybrid encryption process:
 * 1. Decrypt the AES key with RSA-OAEP
 * 2. Import the AES key
 * 3. Decrypt the data with AES-GCM
 */
export async function decryptField(
  encryptedValue: EncryptedFieldValue,
  privateKey: CryptoKey
): Promise<string> {
  try {
    // Decrypt AES key with RSA-OAEP
    const encryptedKeyData = base64ToArrayBuffer(encryptedValue.encryptedKey);
    const aesKeyData = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
      },
      privateKey,
      encryptedKeyData
    );

    // Import AES key
    const aesKey = await crypto.subtle.importKey(
      'raw',
      aesKeyData,
      {
        name: 'AES-GCM',
        length: AES_KEY_SIZE,
      },
      false,
      ['decrypt']
    );

    // Decrypt data with AES-GCM
    const encryptedData = base64ToArrayBuffer(encryptedValue.encryptedData);
    const iv = base64ToArrayBuffer(encryptedValue.iv);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      aesKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch {
    throw new Error('Failed to decrypt field value');
  }
}

/**
 * Change the family password by re-encrypting the private key
 */
export async function changePassword(
  encryptedPrivateKey: EncryptedPrivateKey,
  oldPassword: string,
  newPassword: string
): Promise<EncryptedPrivateKey> {
  // Decrypt with old password
  const privateKeyB64 = await decryptPrivateKey(encryptedPrivateKey, oldPassword);

  // Re-encrypt with new password
  return await encryptPrivateKey(privateKeyB64, newPassword);
}

/**
 * Verify a password against a PBKDF2 hash
 */
export async function verifyPassword(
  password: string,
  passwordHashJson: string
): Promise<boolean> {
  const storedHash: import('./types').PasswordHash = JSON.parse(passwordHashJson);
  const salt = base64ToArrayBuffer(storedHash.salt);

  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );

  const computedHash = arrayBufferToBase64(hashBits);
  return computedHash === storedHash.hash;
}

// Utility functions

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
