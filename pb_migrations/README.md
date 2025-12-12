# PocketBase Migrations

This directory contains database migrations for the HomeOS PocketBase backend.

## What are these migrations?

These JavaScript files define the database schema for HomeOS using PocketBase's migration system. When PocketBase starts, it automatically runs any migrations that haven't been applied yet.

## Migration Files

The migrations are numbered and run in order:

1. **1733932805_gift_cards_collection.js** - Creates the gift_cards collection for managing household gift cards

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
