# PocketBase Migrations

This directory contains database migrations for the HomeOS PocketBase backend.

## What are these migrations?

These JavaScript files define the database schema for HomeOS using PocketBase's migration system. When PocketBase starts, it automatically runs any migrations that haven't been applied yet.

## Migration Files

The migrations are numbered and run in order:

1. **1733932800_users_collection.js** - Extends the built-in users auth collection with custom fields (name, avatar, role)
2. **1733932801_user_roles_collection.js** - Creates the user_roles collection for role-based permissions
3. **1733932802_module_permissions_collection.js** - Creates the module_permissions collection for per-user module access
4. **1733932803_audit_log_collection.js** - Creates the audit_log collection for activity tracking
5. **1733932804_seed_initial_roles.js** - Seeds initial role data (admin, member, viewonly)

## How to Apply Migrations

### Automatic Application

When you run PocketBase for the first time, these migrations will be automatically applied:

```bash
cd pocketbase
./pocketbase serve
```

PocketBase will:
1. Detect new migration files
2. Run them in order
3. Mark them as applied in the database
4. Only run each migration once

### Viewing Migration Status

You can check which migrations have been applied by looking at the `_migrations` table in the PocketBase admin UI:

1. Start PocketBase: `./pocketbase serve`
2. Open admin UI: http://127.0.0.1:8090/_/
3. Go to Settings > Sync > Collections

### Manual Migration Management

If you need to manually manage migrations, use the PocketBase CLI:

```bash
# Check migration status
./pocketbase migrate collections

# Apply all pending migrations (happens automatically on serve)
./pocketbase migrate up

# Rollback the last migration
./pocketbase migrate down 1
```

## Creating New Migrations

When you need to modify the schema in the future:

1. **Use the Admin UI** (Recommended for beginners):
   - Make changes in the PocketBase admin UI
   - Export the changes as a migration file
   - PocketBase can auto-generate migration files from UI changes

2. **Write migrations manually** (Advanced):
   ```javascript
   /// <reference path="../pb_data/types.d.ts" />
   migrate((db) => {
     const dao = new Dao(db);
     const collection = dao.findCollectionByNameOrId("collection_name");

     // Make your changes...

     return dao.saveCollection(collection);
   }, (db) => {
     // Rollback logic (optional but recommended)
   });
   ```

3. **Generate from schema changes**:
   ```bash
   # After making changes in the admin UI
   ./pocketbase migrate collections
   ```

## Migration Best Practices

1. **Never modify existing migrations** - Once a migration has been applied to production, create a new migration instead
2. **Always include rollback logic** - The second function parameter should undo the changes
3. **Test migrations** - Test both the up and down migrations before deploying
4. **Use descriptive names** - Migration files should clearly describe what they do
5. **Keep migrations small** - One logical change per migration file

## Troubleshooting

### Migration Already Applied

If you see "migration already applied" warnings, this is normal. PocketBase tracks which migrations have run.

### Migration Failed

If a migration fails:
1. Check the PocketBase logs for error details
2. Fix the migration file
3. Rollback if necessary: `./pocketbase migrate down 1`
4. Re-run: `./pocketbase serve` (will auto-apply)

### Reset Database

**WARNING: This deletes all data!**

To completely reset the database and re-run all migrations:
```bash
cd pocketbase
rm -rf pb_data
./pocketbase serve
```

## Version Control

- **DO** commit migration files to git
- **DO** version control the `pb_migrations/` directory
- **DON'T** commit the `pb_data/` directory (contains actual database data)

## Further Reading

- [PocketBase Migrations Documentation](https://pocketbase.io/docs/migrations/)
- [PocketBase Collections API](https://pocketbase.io/docs/api-collections/)
- [Schema Documentation](/docs/POCKETBASE_SCHEMA.md)
