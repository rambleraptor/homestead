/**
 * EncryptedFieldDisplay Component
 *
 * A read-only component that displays decrypted field values.
 * Shows a locked indicator when encryption session is not unlocked.
 */

import React, { useState, useEffect } from 'react';
import { useEncryptedSession } from '../EncryptedSessionContext';
import { decryptField } from '../encryption';
import type { EncryptedFieldValue } from '../types';

interface EncryptedFieldDisplayProps {
  value: EncryptedFieldValue | null;
  className?: string;
  showCopyButton?: boolean;
  maskValue?: boolean; // Show as ••• initially, with toggle to reveal
}

export function EncryptedFieldDisplay({
  value,
  className = '',
  showCopyButton = false,
  maskValue = false,
}: EncryptedFieldDisplayProps) {
  const { isUnlocked, getPrivateKey } = useEncryptedSession();
  const [decryptedValue, setDecryptedValue] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(!maskValue);
  const [copySuccess, setCopySuccess] = useState(false);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(decryptedValue);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const toggleReveal = () => {
    setIsRevealed(!isRevealed);
  };

  if (!isUnlocked) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-gray-400">🔒 Locked</span>
      </div>
    );
  }

  if (isDecrypting) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-gray-400">Decrypting...</span>
      </div>
    );
  }

  if (decryptError) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-red-600">{decryptError}</span>
      </div>
    );
  }

  if (!value) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-gray-400">—</span>
      </div>
    );
  }

  const displayValue = maskValue && !isRevealed
    ? '•'.repeat(Math.min(decryptedValue.length, 12))
    : decryptedValue;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono">{displayValue}</span>
      {maskValue && (
        <button
          type="button"
          onClick={toggleReveal}
          className="text-sm text-blue-600 hover:text-blue-800"
          title={isRevealed ? 'Hide' : 'Reveal'}
        >
          {isRevealed ? '👁️' : '👁️‍🗨️'}
        </button>
      )}
      {showCopyButton && decryptedValue && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-sm text-blue-600 hover:text-blue-800"
          title="Copy to clipboard"
        >
          {copySuccess ? '✓' : '📋'}
        </button>
      )}
    </div>
  );
}
