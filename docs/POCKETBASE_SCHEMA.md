# PocketBase Schema Documentation

This document describes the database schema for HomeOS, including collections, fields, and access rules.

## Collections Overview

1. **users** (System Collection - Extended)
2. **user_roles** - Role definitions and permissions
3. **module_permissions** - Module access control per user/role
4. **audit_log** - Activity tracking (optional, for future use)

---

## 1. users Collection (Extended System Collection)

**Type**: Auth Collection (System)

### Fields

| Field | Type | Required | Unique | Description |
|-------|------|----------|--------|-------------|
| id | text | ✓ | ✓ | Auto-generated user ID |
| email | email | ✓ | ✓ | User's email address |
| username | text | ✓ | ✓ | Unique username |
| name | text | ✓ | | Full display name |
| avatar | file | | | Profile picture |
| role | select | ✓ | | User role (admin, member, viewonly) |
| verified | bool | ✓ | | Email verification status |
| emailVisibility | bool | | | Email visibility setting |
| created | date | ✓ | | Account creation timestamp |
| updated | date | ✓ | | Last update timestamp |

### Role Options

```json
{
  "options": [
    { "value": "admin", "label": "Admin (Parent)" },
    { "value": "member", "label": "Member (Family)" },
    { "value": "viewonly", "label": "View Only (Guest)" }
  ]
}
```

### Schema Definition (JSON)

```json
{
  "name": "users",
  "type": "auth",
  "schema": [
    {
      "name": "name",
      "type": "text",
      "required": true,
      "options": {
        "min": 1,
        "max": 100
      }
    },
    {
      "name": "avatar",
      "type": "file",
      "options": {
        "maxSelect": 1,
        "maxSize": 5242880,
        "mimeTypes": ["image/jpeg", "image/png", "image/gif", "image/webp"]
      }
    },
    {
      "name": "role",
      "type": "select",
      "required": true,
      "options": {
        "maxSelect": 1,
        "values": ["admin", "member", "viewonly"]
      }
    }
  ]
}
```

### Access Rules (API Rules)

```javascript
// List/Search Rule
@request.auth.id != ""

// View Rule
@request.auth.id != "" && (
  id = @request.auth.id ||
  @request.auth.role = "admin"
)

// Create Rule
@request.auth.role = "admin"

// Update Rule
@request.auth.id = id || @request.auth.role = "admin"

// Delete Rule
@request.auth.role = "admin"
```

---

## 2. user_roles Collection

**Type**: Base Collection

### Purpose
Define what permissions each role has. This allows for future expansion of the RBAC system.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | text | ✓ | Auto-generated ID |
| role | text | ✓ | Role identifier (admin, member, viewonly) |
| name | text | ✓ | Display name |
| description | text | | Role description |
| permissions | json | ✓ | Permission matrix |
| created | date | ✓ | Creation timestamp |
| updated | date | ✓ | Last update timestamp |

### Schema Definition (JSON)

```json
{
  "name": "user_roles",
  "type": "base",
  "schema": [
    {
      "name": "role",
      "type": "text",
      "required": true,
      "options": {
        "min": 1,
        "max": 50,
        "pattern": "^[a-z_]+$"
      }
    },
    {
      "name": "name",
      "type": "text",
      "required": true,
      "options": {
        "min": 1,
        "max": 100
      }
    },
    {
      "name": "description",
      "type": "text",
      "options": {
        "max": 500
      }
    },
    {
      "name": "permissions",
      "type": "json",
      "required": true
    }
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_role ON user_roles (role)"
  ]
}
```

### Permissions JSON Structure

```json
{
  "modules": {
    "dashboard": { "read": true, "write": false },
    "chores": { "read": true, "write": true, "admin": false },
    "meals": { "read": true, "write": false }
  },
  "system": {
    "manageUsers": false,
    "viewAuditLog": false
  }
}
```

### Access Rules

```javascript
// List/Search Rule
@request.auth.id != ""

// View Rule
@request.auth.id != ""

// Create Rule
@request.auth.role = "admin"

// Update Rule
@request.auth.role = "admin"

// Delete Rule
@request.auth.role = "admin"
```

---

## 3. module_permissions Collection

**Type**: Base Collection

### Purpose
Fine-grained control for module access per user. Overrides role-based defaults.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | text | ✓ | Auto-generated ID |
| user | relation | ✓ | User reference (users) |
| module_id | text | ✓ | Module identifier |
| enabled | bool | ✓ | Module enabled for user |
| permissions | json | | Custom permissions for this user |
| created | date | ✓ | Creation timestamp |
| updated | date | ✓ | Last update timestamp |

### Schema Definition (JSON)

```json
{
  "name": "module_permissions",
  "type": "base",
  "schema": [
    {
      "name": "user",
      "type": "relation",
      "required": true,
      "options": {
        "collectionId": "users",
        "cascadeDelete": true,
        "maxSelect": 1,
        "displayFields": ["name", "email"]
      }
    },
    {
      "name": "module_id",
      "type": "text",
      "required": true,
      "options": {
        "min": 1,
        "max": 100,
        "pattern": "^[a-z_]+$"
      }
    },
    {
      "name": "enabled",
      "type": "bool",
      "required": true
    },
    {
      "name": "permissions",
      "type": "json"
    }
  ],
  "indexes": [
    "CREATE UNIQUE INDEX idx_user_module ON module_permissions (user, module_id)"
  ]
}
```

### Access Rules

```javascript
// List/Search Rule
@request.auth.id != "" && (
  user = @request.auth.id ||
  @request.auth.role = "admin"
)

// View Rule
@request.auth.id != "" && (
  user = @request.auth.id ||
  @request.auth.role = "admin"
)

// Create Rule
@request.auth.role = "admin"

// Update Rule
@request.auth.role = "admin"

// Delete Rule
@request.auth.role = "admin"
```

---

## 4. audit_log Collection (Optional - Future Enhancement)

**Type**: Base Collection

### Purpose
Track user actions for security and debugging.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | text | ✓ | Auto-generated ID |
| user | relation | | User reference (null for system) |
| action | text | ✓ | Action type |
| resource | text | | Resource affected |
| details | json | | Additional context |
| ip_address | text | | Request IP |
| user_agent | text | | Browser/client info |
| created | date | ✓ | Action timestamp |

### Schema Definition (JSON)

```json
{
  "name": "audit_log",
  "type": "base",
  "schema": [
    {
      "name": "user",
      "type": "relation",
      "options": {
        "collectionId": "users",
        "cascadeDelete": false,
        "maxSelect": 1
      }
    },
    {
      "name": "action",
      "type": "text",
      "required": true,
      "options": {
        "max": 100
      }
    },
    {
      "name": "resource",
      "type": "text",
      "options": {
        "max": 200
      }
    },
    {
      "name": "details",
      "type": "json"
    },
    {
      "name": "ip_address",
      "type": "text",
      "options": {
        "max": 45
      }
    },
    {
      "name": "user_agent",
      "type": "text",
      "options": {
        "max": 500
      }
    }
  ],
  "indexes": [
    "CREATE INDEX idx_user_created ON audit_log (user, created)",
    "CREATE INDEX idx_created ON audit_log (created)"
  ]
}
```

### Access Rules

```javascript
// List/Search Rule
@request.auth.role = "admin"

// View Rule
@request.auth.role = "admin"

// Create Rule
@request.auth.id != ""

// Update Rule
false // Audit logs are immutable

// Delete Rule
@request.auth.role = "admin" // Allow cleanup of old logs
```

---

## Setup Instructions

### 1. Initial Setup

1. Download PocketBase binary for your OS from https://pocketbase.io/docs/
2. Place in `/pocketbase` directory
3. Run: `./pocketbase serve`
4. Access admin UI: `http://127.0.0.1:8090/_/`

### 2. Apply Database Migrations

**Automatic (Recommended)**: Migrations are automatically applied when PocketBase starts.

The `pb_migrations/` directory contains all the schema migrations:
- `1733932800_users_collection.js` - Extends users with custom fields (name, avatar, role)
- `1733932801_user_roles_collection.js` - Creates user_roles collection
- `1733932802_module_permissions_collection.js` - Creates module_permissions collection
- `1733932803_audit_log_collection.js` - Creates audit_log collection
- `1733932804_seed_initial_roles.js` - Seeds initial role data (admin, member, viewonly)

When you run `./pocketbase serve`, these migrations will be automatically detected and applied.

**Manual**: If you prefer to apply migrations manually:
```bash
cd pocketbase
./pocketbase migrate up
```

**Verify**: Check the admin UI at `http://127.0.0.1:8090/_/` to see all collections have been created.

See [Migration Documentation](../pb_migrations/README.md) for more details.

### 3. Create First Admin User

**Option A: Via Admin UI** (Recommended for first user)
1. Go to Collections > users
2. Create new auth record with:
   - Email: your@email.com
   - Password: (set a strong password)
   - Name: Your Name
   - Role: admin
   - Verified: true

**Option B: Via Frontend Registration**
1. Start the frontend: `cd frontend && npm run dev`
2. Navigate to the registration page
3. Create your account (first user should be set to admin role manually via Admin UI)

---

## Role-Based Access Matrix

| Feature | Admin | Member | View Only |
|---------|-------|--------|-----------|
| View Dashboard | ✓ | ✓ | ✓ |
| Edit Dashboard | ✓ | ✗ | ✗ |
| View Chores | ✓ | ✓ | ✓ |
| Complete Chores | ✓ | ✓ | ✗ |
| Create/Delete Chores | ✓ | ✗ | ✗ |
| View Meal Plans | ✓ | ✓ | ✓ |
| Edit Meal Plans | ✓ | ✓ | ✗ |
| Manage Users | ✓ | ✗ | ✗ |
| View Audit Log | ✓ | ✗ | ✗ |
| Module Settings | ✓ | ✗ | ✗ |

---

## API Examples

### Authenticate User

```javascript
const authData = await pb.collection('users').authWithPassword(
  'user@example.com',
  'password'
);

// authData.record contains user with role field
console.log(authData.record.role); // "admin", "member", or "viewonly"
```

### Check User Permissions

```javascript
// Get role permissions
const rolePermissions = await pb.collection('user_roles').getFirstListItem(
  `role="${authData.record.role}"`
);

// Check module-specific overrides
const moduleOverride = await pb.collection('module_permissions').getFirstListItem(
  `user="${authData.record.id}" && module_id="chores"`
).catch(() => null);

const hasAccess = moduleOverride?.enabled ??
  rolePermissions.permissions.modules.chores.read;
```

### Fetch User Data with Expand

```javascript
const users = await pb.collection('users').getList(1, 50, {
  expand: 'module_permissions_via_user',
  sort: '-created'
});
```

---

## Migration Strategy

When you need to add new fields or collections, create migration files in `pb_migrations/`:

```javascript
// pb_migrations/1234567890_add_theme_to_users.js
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("users");

  collection.schema.addField(new SchemaField({
    name: "theme",
    type: "select",
    options: {
      maxSelect: 1,
      values: ["light", "dark", "auto"]
    }
  }));

  return dao.saveCollection(collection);
});
```

---

## Security Considerations

1. **HTTPS Only**: Run PocketBase behind a reverse proxy with SSL in production
2. **Strong Passwords**: Enforce minimum password requirements
3. **Rate Limiting**: Configure PocketBase rate limits
4. **Regular Backups**: Backup `pb_data` directory regularly
5. **Audit Logging**: Enable audit_log collection in production
6. **Token Expiration**: Configure appropriate JWT expiration times

---

## Next Steps

1. ✅ Database migrations are ready in `pb_migrations/`
2. Set up PocketBase binary and run migrations (automatically applied on first start)
3. Create initial admin user via Admin UI
4. Test authentication flow in the frontend
5. Build first module (Dashboard)
6. Add module permission checks in UI
7. Configure role permissions as needed
