/**
 * EncryptionStatus Component
 *
 * Shows the current encryption session status and provides unlock/lock controls.
 */

import { useState, useEffect } from 'react';
import { useEncryptedSession } from '../EncryptedSessionContext';
import { getEncryptionMetadata } from '../api';
import { FamilyPasswordPrompt } from './FamilyPasswordPrompt';
import type { EncryptionMetadata } from '../types';

interface EncryptionStatusProps {
  className?: string;
  showDetails?: boolean;
}

export function EncryptionStatus({
  className = '',
  showDetails = true,
}: EncryptionStatusProps) {
  const { isUnlocked, lockEncryption } = useEncryptedSession();
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [metadata, setMetadata] = useState<EncryptionMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadMetadata() {
      setIsLoading(true);
      try {
        const data = await getEncryptionMetadata();
        setMetadata(data);
      } catch (error) {
        console.error('Failed to load encryption metadata:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadMetadata();
  }, []);

  const handleUnlock = () => {
    setIsPromptOpen(true);
  };

  const handleLock = () => {
    lockEncryption();
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-gray-500 text-sm">Loading...</span>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="text-yellow-600 text-sm">⚠️ Encryption not set up</span>
      </div>
    );
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        {isUnlocked ? (
          <>
            <span className="text-green-600 text-sm">🔓 Unlocked</span>
            {showDetails && (
              <button
                onClick={handleLock}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Lock
              </button>
            )}
          </>
        ) : (
          <>
            <span className="text-gray-600 text-sm">🔒 Locked</span>
            {showDetails && (
              <button
                onClick={handleUnlock}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Unlock
              </button>
            )}
          </>
        )}
      </div>

      <FamilyPasswordPrompt
        isOpen={isPromptOpen}
        onClose={() => setIsPromptOpen(false)}
        metadata={metadata}
      />
    </>
  );
}
