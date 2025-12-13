/**
 * Types for encrypted fields feature
 */

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedKeyPair {
  publicKey: string; // Base64 encoded JWK
  privateKey: string; // Base64 encoded JWK
}

export interface EncryptedPrivateKey {
  encryptedData: string; // Base64 encoded encrypted private key
  salt: string; // Base64 encoded salt for PBKDF2
  iv: string; // Base64 encoded initialization vector
}

export interface PasswordHash {
  hash: string; // Base64 encoded PBKDF2 hash
  salt: string; // Base64 encoded salt
}

export interface EncryptionMetadata {
  id?: string;
  publicKey: string; // Base64 encoded public key (JWK)
  encryptedPrivateKey: string; // JSON string of EncryptedPrivateKey
  passwordHash: string; // JSON string of PasswordHash
  created: string;
  updated: string;
}

export interface EncryptedFieldValue {
  encryptedKey: string; // Base64 encoded RSA-encrypted AES key
  encryptedData: string; // Base64 encoded AES-encrypted data
  iv: string; // Base64 encoded initialization vector for AES
}
