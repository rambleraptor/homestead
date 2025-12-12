# Encrypted Fields Feature

End-to-end encryption for sensitive field data in HomeOS.

## Overview

The encrypted fields feature provides client-side encryption for sensitive data. Data is encrypted in the browser before being sent to the server, stored encrypted in the database, and only decrypted in the browser when the user provides the family password.

## Key Features

- **🔐 End-to-end encryption**: Data is encrypted in the browser, stored encrypted, and decrypted in the browser
- **🔑 Public/private key cryptography**: Uses RSA-OAEP for field encryption
- **🔒 Password-protected private key**: Private key is encrypted with a family password using AES-GCM
- **💾 Session-based decryption**: Private key is never persisted, only kept in memory during the session
- **🎨 Ready-to-use components**: React components for encrypted inputs, textareas, and display
- **🧪 Fully tested**: Comprehensive test suite covering all functionality

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  User enters family password                       │    │
│  │  ↓                                                  │    │
│  │  Decrypt private key (in memory only)             │    │
│  │  ↓                                                  │    │
│  │  Encrypt/decrypt fields with public/private key   │    │
│  └────────────────────────────────────────────────────┘    │
│  Encrypted data only ↓↑                                     │
└─────────────────────────────────────────────────────────────┘
                      ↓↑
┌─────────────────────────────────────────────────────────────┐
│                     PocketBase                              │
│  - Public key (accessible)                                  │
│  - Encrypted private key (encrypted with family password)   │
│  - Encrypted field data (encrypted with public key)         │
└─────────────────────────────────────────────────────────────┘
```

## Structure

```
src/core/crypto/
├── types.ts                        # TypeScript types
├── encryption.ts                   # Core crypto functions
├── keyManagement.ts               # In-memory key storage
├── api.ts                         # PocketBase API helpers
├── EncryptedSessionContext.tsx   # React context for session state
├── components/
│   ├── EncryptedInput.tsx        # Input component
│   ├── EncryptedTextarea.tsx     # Textarea component
│   ├── EncryptedFieldDisplay.tsx # Display component
│   ├── FamilyPasswordPrompt.tsx  # Password entry modal
│   ├── BootstrapEncryption.tsx   # Setup modal
│   └── EncryptionStatus.tsx      # Status indicator
├── __tests__/
│   ├── encryption.test.ts
│   ├── keyManagement.test.ts
│   └── EncryptedSessionContext.test.tsx
├── DEMO.md                        # Usage examples
├── README.md                      # This file
└── index.ts                       # Public exports
```

## Quick Start

### 1. Install (already included in HomeOS)

The encrypted fields feature is built into HomeOS. No installation needed!

### 2. Bootstrap encryption (one-time)

```tsx
import { bootstrapEncryption } from '@/core/crypto';

// Admin user sets up encryption with a family password
await bootstrapEncryption('my-secure-family-password');
```

### 3. Add provider to your app

```tsx
import { EncryptedSessionProvider } from '@/core/crypto';

function App() {
  return (
    <EncryptedSessionProvider>
      <YourApp />
    </EncryptedSessionProvider>
  );
}
```

### 4. Use encrypted fields

```tsx
import { EncryptedInput, useEncryptedSession } from '@/core/crypto';

function MyForm() {
  const { isUnlocked } = useEncryptedSession();
  const [encryptedPin, setEncryptedPin] = useState(null);

  return (
    <div>
      {!isUnlocked && <p>🔒 Unlock encryption to use this field</p>}

      <EncryptedInput
        value={encryptedPin}
        onChange={setEncryptedPin}
        type="password"
        placeholder="Enter PIN"
      />
    </div>
  );
}
```

## Documentation

- [DEMO.md](./DEMO.md) - Complete usage examples and API reference
- See inline JSDoc comments in source files for detailed documentation

## Cryptography Details

- **Asymmetric encryption**: RSA-OAEP (2048-bit keys) with SHA-256
- **Symmetric encryption**: AES-GCM (256-bit) for private key protection
- **Key derivation**: PBKDF2 with 100,000 iterations
- **Password hashing**: SHA-256 for verification
- **All operations**: Native Web Crypto API (secure and performant)

## Security Considerations

✅ **Good practices:**
- Private key never leaves the browser unencrypted
- Password is never stored, only hashed for verification
- Encryption session is memory-only (cleared on refresh)
- Uses browser-native cryptography (Web Crypto API)

⚠️ **Important notes:**
- Encrypted data is only as secure as the family password
- If the family password is lost, data cannot be recovered
- Use HTTPS in production to protect data in transit
- Consider implementing password strength requirements
- Consider implementing backup/recovery mechanisms

## Testing

Run the test suite:

```bash
npm test src/core/crypto
```

Test coverage:
- ✅ Core encryption functions
- ✅ Key generation and import/export
- ✅ Password hashing and verification
- ✅ Private key encryption/decryption
- ✅ Field encryption/decryption
- ✅ Password change functionality
- ✅ Key management and session state
- ✅ React context integration

## Migration

PocketBase migration included at:
```
pb_migrations/1734000000_encryption_metadata_collection.js
```

This creates the `encryption_metadata` collection to store:
- Public key
- Encrypted private key
- Password hash

## License

Part of HomeOS - see main project LICENSE

## Support

For issues or questions, please refer to the main HomeOS documentation or create an issue in the repository.
