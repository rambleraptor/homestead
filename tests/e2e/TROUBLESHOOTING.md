# E2E Tests Troubleshooting

## Current Issue: Admin Authentication 404

### Problem
```
❌ Admin authentication failed: ClientResponseError 404
url: 'http://127.0.0.1:8092/api/admins/auth-with-password'
message: "The requested resource wasn't found."
```

### What We Know
✅ **Admin user created successfully via CLI**
```
Successfully saved superuser "admin@test.local"!
Admin creation exited with code: 0
```

❌ **But API endpoint returns 404**
- The `/api/admins/auth-with-password` endpoint doesn't exist
- PocketBase is running (server started successfully)
- Admin user exists in database

### Possible Causes

1. **PocketBase Version Issue**
   - PocketBase 0.34.2 might have changed the admin auth endpoint
   - The endpoint path might be different

2. **Admin API Disabled**
   - Admin authentication via API might be disabled by default
   - Might require configuration to enable

3. **Initialization Timing**
   - API routes might not be fully registered yet
   - Need to wait longer or check differently

### Alternative Approaches

#### Option 1: Use User Registration (Recommended)
Instead of authenticating as admin, create users via the registration endpoint:
```typescript
// See: tests/e2e/fixtures/pocketbase-registration.fixture.ts
const user = await pocketbase.collection('users').create({
  email, password, passwordConfirm, name
});
```

**Pros:**
- Uses public endpoint (should work)
- More realistic (like real users)
- Doesn't require admin access

**Cons:**
- Requires user registration to be enabled
- Might need collection rule configuration

#### Option 2: Create Users via CLI
Create test users using PocketBase CLI before starting server:
```bash
pocketbase user create test@example.com password --dir pb_test_data
```

**Pros:**
- Bypasses API entirely
- Guaranteed to work

**Cons:**
- More complex setup
- Need to parse CLI output for user ID

#### Option 3: Configure PocketBase Admin API
Enable admin API access in PocketBase configuration

**Pros:**
- Clean admin-based approach
- Full control over users

**Cons:**
- Requires finding the right configuration
- Might not be supported in this version

### Next Steps

1. ✅ Check PocketBase health endpoint
2. ✅ Log detailed API error information
3. ⏳ Try user registration approach
4. ⏳ Check PocketBase documentation for correct admin endpoint
5. ⏳ Consider creating users via CLI instead

### Debugging Commands

Check PocketBase version:
```bash
./pocketbase --version
```

Check available API endpoints:
```bash
curl http://127.0.0.1:8092/api/
```

Check if admin exists:
```bash
./pocketbase superuser list --dir pb_test_data
```

Test admin auth directly:
```bash
curl -X POST http://127.0.0.1:8092/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"admin@test.local","password":"TestAdmin123!"}'
```
