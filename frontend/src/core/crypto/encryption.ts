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
 * Hash a password using SHA-256 for verification purposes
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

/**
 * Derive an AES key from a password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
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
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
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
  } catch (error) {
    throw new Error('Failed to decrypt private key. Invalid password?');
  }
}

/**
 * Encrypt a field value using the public key
 */
export async function encryptField(
  value: string,
  publicKey: CryptoKey
): Promise<EncryptedFieldValue> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  // RSA-OAEP doesn't use IV, but we'll generate one for consistency
  // and potential future use with hybrid encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  const encryptedData = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    data
  );

  return {
    data: arrayBufferToBase64(encryptedData),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a field value using the private key
 */
export async function decryptField(
  encryptedValue: EncryptedFieldValue,
  privateKey: CryptoKey
): Promise<string> {
  const data = base64ToArrayBuffer(encryptedValue.data);

  try {
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP',
      },
      privateKey,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
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
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === passwordHash;
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
