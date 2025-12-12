# PocketBase Schema Documentation

This document describes the database schema for HomeOS, including collections, fields, and access rules.

## Collections Overview

1. **users** (System Auth Collection)
2. **gift_cards** - Gift card management and tracking

---

## 1. users Collection

**Type**: Auth Collection (System - Built-in)

### Fields

| Field | Type | Required | Unique | Description |
|-------|------|----------|--------|-------------|
| id | text | ✓ | ✓ | Auto-generated user ID |
| email | email | ✓ | ✓ | User's email address |
| username | text | | ✓ | Unique username (optional) |
| name | text | | | Full display name |
| avatar | file | | | Profile picture |
| verified | bool | ✓ | | Email verification status |
| emailVisibility | bool | | | Email visibility setting |
| created | date | ✓ | | Account creation timestamp |
| updated | date | ✓ | | Last update timestamp |

### Notes

This is PocketBase's built-in auth collection. You can extend it with custom fields as needed through the PocketBase admin UI.

### Recommended Access Rules (API Rules)

```javascript
// List/Search Rule
@request.auth.id != ""

// View Rule
@request.auth.id != ""

// Create Rule
"" // Allow registration, or restrict with: @request.auth.id != ""

// Update Rule
@request.auth.id = id

// Delete Rule
@request.auth.id = id
```

---

## 2. gift_cards Collection

**Type**: Base Collection

**Migration**: `1733932805_gift_cards_collection.js`

### Purpose

Track and manage household gift cards with merchant information, card numbers, PINs, and balances.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | text | ✓ | Auto-generated ID |
| merchant | text | ✓ | Merchant/store name (max 200 chars) |
| card_number | text | ✓ | Gift card number (max 100 chars) |
| pin | text | | Security PIN if applicable (max 50 chars) |
| amount | number | ✓ | Current balance on the card (min 0) |
| notes | text | | Additional information (max 1000 chars) |
| created_by | relation | | User who created the card (users) |
| created | date | ✓ | Creation timestamp |
| updated | date | ✓ | Last update timestamp |

### Indexes

```sql
CREATE INDEX idx_merchant ON gift_cards (merchant)
CREATE INDEX idx_created_by ON gift_cards (created_by)
```

### Access Rules (API Rules)

```javascript
// List/Search Rule
@request.auth.id != ""

// View Rule
@request.auth.id != ""

// Create Rule
@request.auth.id != ""

// Update Rule
@request.auth.id != "" && (created_by = @request.auth.id || @request.auth.role = "admin")

// Delete Rule
@request.auth.id != "" && (created_by = @request.auth.id || @request.auth.role = "admin")
```

### Notes

- All authenticated users can view and create gift cards
- Only the creator or admins can edit/delete cards
- Card numbers and PINs are masked by default in the UI for security
- The `created_by` relation is optional but recommended for tracking ownership

---

## Setup Instructions

### 1. Initial Setup

1. Download PocketBase binary for your OS from https://pocketbase.io/docs/
2. Place in `/pocketbase` directory
3. Run: `./pocketbase serve`
4. Access admin UI: `http://127.0.0.1:8090/_/`

### 2. Apply Database Migrations

**Automatic (Recommended)**: Migrations are automatically applied when PocketBase starts.

The `pb_migrations/` directory contains the schema migrations:
- `1733932805_gift_cards_collection.js` - Creates the gift_cards collection

When you run `./pocketbase serve`, these migrations will be automatically detected and applied.

**Manual**: If you prefer to apply migrations manually:
```bash
cd pocketbase
./pocketbase migrate up
```

**Verify**: Check the admin UI at `http://127.0.0.1:8090/_/` to see all collections have been created.

See [Migration Documentation](../pb_migrations/README.md) for more details.

### 3. Create First User

**Option A: Via Admin UI** (Recommended for first user)
1. Go to Collections > users
2. Create new auth record with:
   - Email: your@email.com
   - Password: (set a strong password)
   - Name: Your Name (optional)
   - Verified: true

**Option B: Via Frontend Registration**
1. Start the frontend: `cd frontend && npm run dev`
2. Navigate to the registration page
3. Create your account

---

## API Examples

### Authenticate User

```javascript
const authData = await pb.collection('users').authWithPassword(
  'user@example.com',
  'password'
);

console.log(authData.record.id); // User ID
console.log(authData.record.email); // User email
```

### Create a Gift Card

```javascript
const giftCard = await pb.collection('gift_cards').create({
  merchant: 'Amazon',
  card_number: '1234-5678-9012-3456',
  pin: '1234',
  amount: 50.00,
  notes: 'Birthday gift from Mom',
  created_by: pb.authStore.model?.id
});
```

### Fetch Gift Cards

```javascript
// Get all gift cards
const giftCards = await pb.collection('gift_cards').getFullList({
  sort: '-id'
});

// Get gift cards with creator info
const giftCardsWithCreator = await pb.collection('gift_cards').getFullList({
  sort: '-id',
  expand: 'created_by'
});
```

### Update a Gift Card

```javascript
await pb.collection('gift_cards').update(giftCardId, {
  amount: 25.00, // Updated balance
  notes: 'Used $25'
});
```

### Delete a Gift Card

```javascript
await pb.collection('gift_cards').delete(giftCardId);
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
2. ✅ Gift Cards module is implemented and functional
3. Set up PocketBase binary and run migrations (automatically applied on first start)
4. Create initial user via Admin UI or registration
5. Test authentication flow in the frontend
6. Create additional modules as needed (see `docs/MODULE_GUIDE.md`)
7. Extend the database schema with new collections for new features
