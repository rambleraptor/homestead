/**
 * EncryptedTextarea Component
 *
 * A textarea that automatically encrypts its value before saving.
 * Requires the encryption session to be unlocked (encrypted-friendly).
 */

import React, { useState, useEffect } from 'react';
import { useEncryptedSession } from '../useEncryptedSession';
import { encryptField, decryptField } from '../encryption';
import type { EncryptedFieldValue } from '../types';

interface EncryptedTextareaProps {
  value: EncryptedFieldValue | null;
  onChange: (encryptedValue: EncryptedFieldValue | null) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
}

export function EncryptedTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  required = false,
  disabled = false,
  rows = 4,
  maxLength,
}: EncryptedTextareaProps) {
  const { isUnlocked, getPrivateKey, getPublicKey } = useEncryptedSession();
  const [decryptedValue, setDecryptedValue] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Decrypt value when it changes or when session is unlocked
  useEffect(() => {
    async function decrypt() {
      if (!value || !isUnlocked) {
        setDecryptedValue('');
        setDecryptError(null);
        return;
      }

      setIsDecrypting(true);
      setDecryptError(null);

      try {
        const privateKey = getPrivateKey();
        if (!privateKey) {
          throw new Error('Private key not available');
        }

        const decrypted = await decryptField(value, privateKey);
        setDecryptedValue(decrypted);
      } catch (error) {
        console.error('Failed to decrypt field:', error);
        setDecryptError('Failed to decrypt value');
        setDecryptedValue('');
      } finally {
        setIsDecrypting(false);
      }
    }

    decrypt();
  }, [value, isUnlocked, getPrivateKey]);

  // Encrypt and update when user changes value
  const handleChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setDecryptedValue(newValue);

    if (!newValue) {
      onChange(null);
      return;
    }

    if (!isUnlocked) {
      setDecryptError('Encryption session not unlocked');
      return;
    }

    try {
      const publicKey = getPublicKey();
      if (!publicKey) {
        throw new Error('Public key not available');
      }

      const encrypted = await encryptField(newValue, publicKey);
      onChange(encrypted);
      setDecryptError(null);
    } catch (error) {
      console.error('Failed to encrypt field:', error);
      setDecryptError('Failed to encrypt value');
    }
  };

  if (!isUnlocked) {
    return (
      <div className={className}>
        <textarea
          disabled
          placeholder="🔒 Unlock encryption to view/edit"
          rows={rows}
          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed resize-none"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <textarea
        value={isDecrypting ? 'Decrypting...' : decryptedValue}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled || isDecrypting}
        rows={rows}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
      {decryptError && (
        <p className="mt-1 text-sm text-red-600">{decryptError}</p>
      )}
    </div>
  );
}
