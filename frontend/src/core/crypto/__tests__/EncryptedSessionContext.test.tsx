/**
 * Tests for EncryptedSessionContext
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EncryptedSessionProvider, useEncryptedSession } from '../EncryptedSessionContext';
import {
  generateKeyPair,
  exportKeyPair,
  encryptPrivateKey,
  hashPassword,
} from '../encryption';
import { lockEncryption } from '../keyManagement';
import type { EncryptionMetadata } from '../types';

// Test component that uses the context
function TestComponent() {
  const { isUnlocked, unlockEncryption, lockEncryption: lock } = useEncryptedSession();

  return (
    <div>
      <div>Status: {isUnlocked ? 'Unlocked' : 'Locked'}</div>
      <button onClick={lock}>Lock</button>
    </div>
  );
}

describe('EncryptedSessionContext', () => {
  let testMetadata: EncryptionMetadata;
  const testPassword = 'test-password';

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
    lockEncryption();
  });

  it('should provide context values', () => {
    render(
      <EncryptedSessionProvider>
        <TestComponent />
      </EncryptedSessionProvider>
    );

    expect(screen.getByText('Status: Locked')).toBeInTheDocument();
  });

  it('should unlock encryption with correct password', async () => {
    const user = userEvent.setup();

    function UnlockTestComponent() {
      const { isUnlocked, unlockEncryption } = useEncryptedSession();

      const handleUnlock = async () => {
        await unlockEncryption(testMetadata, testPassword);
      };

      return (
        <div>
          <div>Status: {isUnlocked ? 'Unlocked' : 'Locked'}</div>
          <button onClick={handleUnlock}>Unlock</button>
        </div>
      );
    }

    render(
      <EncryptedSessionProvider>
        <UnlockTestComponent />
      </EncryptedSessionProvider>
    );

    expect(screen.getByText('Status: Locked')).toBeInTheDocument();

    const unlockButton = screen.getByText('Unlock');
    await user.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByText('Status: Unlocked')).toBeInTheDocument();
    });
  });

  it('should lock encryption', async () => {
    const user = userEvent.setup();

    function LockTestComponent() {
      const { isUnlocked, unlockEncryption, lockEncryption } = useEncryptedSession();

      const handleUnlock = async () => {
        await unlockEncryption(testMetadata, testPassword);
      };

      return (
        <div>
          <div>Status: {isUnlocked ? 'Unlocked' : 'Locked'}</div>
          <button onClick={handleUnlock}>Unlock</button>
          <button onClick={lockEncryption}>Lock</button>
        </div>
      );
    }

    render(
      <EncryptedSessionProvider>
        <LockTestComponent />
      </EncryptedSessionProvider>
    );

    // Unlock first
    const unlockButton = screen.getByText('Unlock');
    await user.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByText('Status: Unlocked')).toBeInTheDocument();
    });

    // Then lock
    const lockButton = screen.getByText('Lock');
    await user.click(lockButton);

    expect(screen.getByText('Status: Locked')).toBeInTheDocument();
  });

  it('should provide access to keys when unlocked', async () => {
    const user = userEvent.setup();

    function KeyAccessComponent() {
      const { isUnlocked, unlockEncryption, getPrivateKey, getPublicKey } =
        useEncryptedSession();

      const handleUnlock = async () => {
        await unlockEncryption(testMetadata, testPassword);
      };

      const privateKey = getPrivateKey();
      const publicKey = getPublicKey();

      return (
        <div>
          <div>Status: {isUnlocked ? 'Unlocked' : 'Locked'}</div>
          <div>Private Key: {privateKey ? 'Available' : 'Not Available'}</div>
          <div>Public Key: {publicKey ? 'Available' : 'Not Available'}</div>
          <button onClick={handleUnlock}>Unlock</button>
        </div>
      );
    }

    render(
      <EncryptedSessionProvider>
        <KeyAccessComponent />
      </EncryptedSessionProvider>
    );

    expect(screen.getByText('Private Key: Not Available')).toBeInTheDocument();
    expect(screen.getByText('Public Key: Not Available')).toBeInTheDocument();

    const unlockButton = screen.getByText('Unlock');
    await user.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByText('Private Key: Available')).toBeInTheDocument();
      expect(screen.getByText('Public Key: Available')).toBeInTheDocument();
    });
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useEncryptedSession must be used within EncryptedSessionProvider');

    console.error = originalError;
  });
});
