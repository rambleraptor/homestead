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

export interface EncryptionMetadata {
  id?: string;
  publicKey: string; // Base64 encoded public key (JWK)
  encryptedPrivateKey: string; // JSON string of EncryptedPrivateKey
  passwordHash: string; // Hash of family password for verification
  created: string;
  updated: string;
}

export interface EncryptedFieldValue {
  data: string; // Base64 encoded encrypted data
  iv: string; // Base64 encoded initialization vector
}
