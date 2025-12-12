
# Encrypted Fields Demo

This document demonstrates how to use the encrypted fields feature in your application.

## Setup

### 1. Add EncryptedSessionProvider to your app

Wrap your app (or the parts that need encryption) with the `EncryptedSessionProvider`:

```tsx
import { EncryptedSessionProvider } from '@/core/crypto';

function App() {
  return (
    <EncryptedSessionProvider>
      {/* Your app components */}
    </EncryptedSessionProvider>
  );
}
```

### 2. Bootstrap encryption (one-time setup)

Before using encrypted fields, you need to bootstrap the encryption system with a family password:

```tsx
import { bootstrapEncryption, isEncryptionBootstrapped } from '@/core/crypto';

async function setupEncryption() {
  const isBootstrapped = await isEncryptionBootstrapped();

  if (!isBootstrapped) {
    // Prompt user for a family password
    const familyPassword = prompt('Create a family password:');
    await bootstrapEncryption(familyPassword);
  }
}
```

Or use the `BootstrapEncryption` component:

```tsx
import { BootstrapEncryption } from '@/core/crypto';

function SetupPage() {
  const [showBootstrap, setShowBootstrap] = useState(false);

  return (
    <div>
      <button onClick={() => setShowBootstrap(true)}>
        Set Up Encryption
      </button>

      <BootstrapEncryption
        isOpen={showBootstrap}
        onClose={() => setShowBootstrap(false)}
        onSuccess={() => console.log('Encryption set up!')}
      />
    </div>
  );
}
```

### 3. Unlock encryption session

Users need to unlock the encryption session by entering the family password:

```tsx
import { useEncryptedSession, FamilyPasswordPrompt } from '@/core/crypto';
import { getEncryptionMetadata } from '@/core/crypto';

function MyComponent() {
  const { isUnlocked } = useEncryptedSession();
  const [showPrompt, setShowPrompt] = useState(false);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    async function loadMetadata() {
      const data = await getEncryptionMetadata();
      setMetadata(data);
    }
    loadMetadata();
  }, []);

  return (
    <div>
      <div>Encryption Status: {isUnlocked ? '🔓 Unlocked' : '🔒 Locked'}</div>

      {!isUnlocked && (
        <button onClick={() => setShowPrompt(true)}>
          Unlock Encrypted Fields
        </button>
      )}

      <FamilyPasswordPrompt
        isOpen={showPrompt}
        onClose={() => setShowPrompt(false)}
        metadata={metadata}
      />
    </div>
  );
}
```

Or use the `EncryptionStatus` component for a complete UI:

```tsx
import { EncryptionStatus } from '@/core/crypto';

function MyComponent() {
  return (
    <div>
      <EncryptionStatus />
    </div>
  );
}
```

## Using Encrypted Fields

### Storing Encrypted Data

When storing encrypted data, you need to serialize the `EncryptedFieldValue` object to JSON:

```tsx
import { EncryptedInput } from '@/core/crypto';
import type { EncryptedFieldValue } from '@/core/crypto';
import { pb, Collections } from '@/core/api/pocketbase';

function SecureForm() {
  const [encryptedPin, setEncryptedPin] = useState<EncryptedFieldValue | null>(null);

  const handleSubmit = async () => {
    // Serialize the encrypted value to JSON for storage
    const data = {
      encrypted_pin: encryptedPin ? JSON.stringify(encryptedPin) : null,
    };

    await pb.collection('your_collection').create(data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>PIN (Encrypted)</label>
      <EncryptedInput
        value={encryptedPin}
        onChange={setEncryptedPin}
        type="password"
        placeholder="Enter PIN"
      />

      <button type="submit">Save</button>
    </form>
  );
}
```

### Reading Encrypted Data

When reading encrypted data, parse the JSON string back to an `EncryptedFieldValue` object:

```tsx
import { EncryptedFieldDisplay } from '@/core/crypto';
import type { EncryptedFieldValue } from '@/core/crypto';

function SecureDisplay({ record }) {
  // Parse the JSON string back to EncryptedFieldValue
  const encryptedPin: EncryptedFieldValue | null = record.encrypted_pin
    ? JSON.parse(record.encrypted_pin)
    : null;

  return (
    <div>
      <label>PIN:</label>
      <EncryptedFieldDisplay
        value={encryptedPin}
        maskValue={true}
        showCopyButton={true}
      />
    </div>
  );
}
```

### Complete Example: Secure Notes

```tsx
import { useState, useEffect } from 'react';
import {
  EncryptedInput,
  EncryptedTextarea,
  EncryptedFieldDisplay,
  EncryptionStatus,
  useEncryptedSession
} from '@/core/crypto';
import type { EncryptedFieldValue } from '@/core/crypto';
import { pb } from '@/core/api/pocketbase';

interface SecureNote {
  id: string;
  title: string;
  encrypted_content: string; // JSON string
  created: string;
  updated: string;
}

function SecureNotesApp() {
  const { isUnlocked } = useEncryptedSession();
  const [notes, setNotes] = useState<SecureNote[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [encryptedContent, setEncryptedContent] = useState<EncryptedFieldValue | null>(null);

  // Load notes
  useEffect(() => {
    async function loadNotes() {
      const records = await pb.collection('secure_notes').getFullList<SecureNote>();
      setNotes(records);
    }
    loadNotes();
  }, []);

  // Create note
  const handleCreate = async () => {
    const data = {
      title,
      encrypted_content: encryptedContent ? JSON.stringify(encryptedContent) : null,
    };

    await pb.collection('secure_notes').create(data);
    setTitle('');
    setEncryptedContent(null);
    setIsEditing(false);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Secure Notes</h1>
        <EncryptionStatus />
      </div>

      {!isUnlocked && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
          <p>🔒 Unlock encryption to view and create secure notes</p>
        </div>
      )}

      {isEditing && isUnlocked && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">New Secure Note</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="Note title"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Content (Encrypted)
            </label>
            <EncryptedTextarea
              value={encryptedContent}
              onChange={setEncryptedContent}
              placeholder="Enter your secure content..."
              rows={6}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save Note
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!isEditing && (
        <button
          onClick={() => setIsEditing(true)}
          disabled={!isUnlocked}
          className="mb-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          + New Secure Note
        </button>
      )}

      <div className="space-y-4">
        {notes.map((note) => {
          const content: EncryptedFieldValue | null = note.encrypted_content
            ? JSON.parse(note.encrypted_content)
            : null;

          return (
            <div key={note.id} className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-2">{note.title}</h3>
              <div className="text-gray-600">
                <EncryptedFieldDisplay
                  value={content}
                  showCopyButton={true}
                />
              </div>
              <div className="mt-2 text-sm text-gray-400">
                Created: {new Date(note.created).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## PocketBase Collection Setup

Add an encrypted field to your collection:

```javascript
// In your PocketBase migration
{
  "id": "encrypted_pin",
  "name": "encrypted_pin",
  "type": "text",
  "required": false,
  "options": {
    "min": null,
    "max": null,
    "pattern": ""
  }
}
```

## Components Reference

### EncryptedInput

Input field that encrypts its value:

```tsx
<EncryptedInput
  value={encryptedValue}
  onChange={setEncryptedValue}
  type="text" | "password" | "email" | "tel" | "url"
  placeholder="Enter value"
  required={false}
  disabled={false}
  maxLength={100}
  className="custom-class"
/>
```

### EncryptedTextarea

Textarea that encrypts its value:

```tsx
<EncryptedTextarea
  value={encryptedValue}
  onChange={setEncryptedValue}
  placeholder="Enter value"
  required={false}
  disabled={false}
  rows={4}
  maxLength={1000}
  className="custom-class"
/>
```

### EncryptedFieldDisplay

Display encrypted data (read-only):

```tsx
<EncryptedFieldDisplay
  value={encryptedValue}
  maskValue={true} // Show as •••, with toggle to reveal
  showCopyButton={true} // Show copy to clipboard button
  className="custom-class"
/>
```

### EncryptionStatus

Shows encryption status with lock/unlock controls:

```tsx
<EncryptionStatus
  showDetails={true} // Show lock/unlock buttons
  className="custom-class"
/>
```

### FamilyPasswordPrompt

Modal for entering family password:

```tsx
<FamilyPasswordPrompt
  isOpen={showPrompt}
  onClose={() => setShowPrompt(false)}
  metadata={encryptionMetadata}
  onSuccess={() => console.log('Unlocked!')}
/>
```

### BootstrapEncryption

Modal for setting up encryption:

```tsx
<BootstrapEncryption
  isOpen={showBootstrap}
  onClose={() => setShowBootstrap(false)}
  onSuccess={() => console.log('Encryption set up!')}
/>
```

## API Functions

### Bootstrap and Setup

```tsx
import {
  bootstrapEncryption,
  isEncryptionBootstrapped,
  getEncryptionMetadata,
  changeFamilyPassword
} from '@/core/crypto';

// Check if bootstrapped
const isSetup = await isEncryptionBootstrapped();

// Bootstrap (one-time)
await bootstrapEncryption('family-password');

// Get metadata
const metadata = await getEncryptionMetadata();

// Change password
await changeFamilyPassword('old-password', 'new-password');
```

### Session Management

```tsx
import { useEncryptedSession } from '@/core/crypto';

function MyComponent() {
  const {
    isUnlocked,
    metadata,
    unlockEncryption,
    lockEncryption,
    getPrivateKey,
    getPublicKey,
  } = useEncryptedSession();

  // Unlock session
  await unlockEncryption(metadata, 'password');

  // Lock session
  lockEncryption();
}
```

## Security Notes

1. **Never persist the decrypted private key** - It only lives in memory during the session
2. **Always validate the family password** before unlocking
3. **Use HTTPS in production** to protect data in transit
4. **Encrypted data is only as secure as the family password** - Use a strong password
5. **If the family password is lost, encrypted data cannot be recovered** - Keep it safe!
6. **The encryption session is cleared on page refresh** - Users must unlock again

## Troubleshooting

### "Private key not available"

- Make sure the encryption session is unlocked
- Check that `isUnlocked` is `true` before trying to encrypt/decrypt

### "Failed to decrypt field value"

- The data may have been encrypted with a different key
- The stored data may be corrupted
- Make sure you're parsing the JSON correctly

### Components not rendering

- Make sure `EncryptedSessionProvider` wraps your components
- Check browser console for errors
- Ensure Web Crypto API is available (HTTPS or localhost)
