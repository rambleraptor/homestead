# PocketBase Hooks

This directory contains PocketBase hooks that extend the functionality of HomeOS.

## What are PocketBase Hooks?

PocketBase hooks are JavaScript files that run inside the PocketBase server. They can:

- Listen to database events (create, update, delete)
- Run scheduled tasks with cron jobs
- Add custom API endpoints
- Extend authentication logic
- Perform background processing

## Available Hooks

### `send_notifications.pb.js`

Sends web push notifications for Events module reminders.

**Features:**
- Runs daily at 9:00 AM to check for events needing notifications
- Supports all notification preferences (day of, day before, week before)
- Handles recurring yearly events correctly
- Automatically cleans up expired subscriptions
- Creates notification records in the database
- Provides admin-only test endpoint for manual testing

**Requirements:**
- `web-push` npm package installed in PocketBase directory
- Environment variables configured (see below)

**Installation:**

```bash
# 1. Install web-push in your PocketBase directory
cd pocketbase
npm init -y  # If package.json doesn't exist
npm install web-push

# 2. Generate VAPID keys (if you haven't already)
npx web-push generate-vapid-keys

# 3. Set environment variables
export VAPID_PUBLIC_KEY="BEl62iUYgUivx..."
export VAPID_PRIVATE_KEY="UUxI4O8-FbRou..."
export VAPID_EMAIL="mailto:admin@example.com"

# 4. Start PocketBase (it will auto-load hooks from pb_hooks/)
./pocketbase serve
```

**Configuration:**

The hook requires these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VAPID_PUBLIC_KEY` | Your VAPID public key | `BEl62iUYgUivx...` |
| `VAPID_PRIVATE_KEY` | Your VAPID private key (keep secret!) | `UUxI4O8-FbRou...` |
| `VAPID_EMAIL` | Contact email for push service | `mailto:admin@example.com` |

**Verification:**

When PocketBase starts, you should see:

```
✅ Event notifications system initialized
   VAPID email: mailto:admin@example.com
   Public key: BEl62iUYgUivx...
✅ Cron job registered: Daily at 9:00 AM
```

**Testing:**

1. **Run validation test:**
   ```bash
   make test-hooks
   ```

2. **Manual trigger (requires admin auth):**
   ```bash
   # Get admin token from PocketBase admin UI or login endpoint
   curl -X POST http://localhost:8090/api/send-test-notification \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

3. **Check logs:**
   ```bash
   # PocketBase logs will show notification activity
   [2024-01-15 09:00:00] Checking for events needing notifications...
   Found 5 events to check
   Sending day_before notification for: John's Birthday
   ✓ Sent notification for John's Birthday
   ```

**Troubleshooting:**

| Issue | Solution |
|-------|----------|
| Hook not loading | Ensure file is in `pb_hooks/` and ends with `.pb.js` |
| VAPID error | Check environment variables are set correctly |
| web-push not found | Run `npm install web-push` in `pocketbase/` directory |
| No notifications sent | Check logs for errors, verify subscriptions exist |
| Subscription expired | Normal - hook automatically deletes expired subs |

## Development

### Adding New Hooks

1. Create a new `.pb.js` file in this directory
2. Use PocketBase hook APIs:
   - `onModelBeforeCreate`, `onModelAfterCreate`
   - `onModelBeforeUpdate`, `onModelAfterUpdate`
   - `onModelBeforeDelete`, `onModelAfterDelete`
   - `onAfterBootstrap` - runs when PocketBase starts
   - `cronAdd` - schedule recurring tasks
   - `routerAdd` - add custom endpoints

3. Document your hook in this README

### Example Hook Structure

```javascript
/// <reference path="../pb_data/types.d.ts" />

onAfterBootstrap((e) => {
  console.log('My hook loaded!');

  // Add cron job
  cronAdd('my-task', '0 * * * *', () => {
    console.log('Running hourly task');
  });

  // Add API endpoint
  routerAdd('GET', '/api/my-endpoint', (c) => {
    return c.json(200, { message: 'Hello!' });
  });
});

// Listen to model events
onModelAfterCreate((e) => {
  console.log('Record created:', e.model.tableName());
}, 'events'); // Optional: filter by collection
```

### Testing Hooks

All hooks should have corresponding validation tests in `tests/hooks/`.

Example test structure:
```javascript
// tests/hooks/test-my-hook.js
const fs = require('fs');
const path = require('path');

const hookPath = path.join(__dirname, '../../pb_hooks/my-hook.pb.js');

// Test 1: File exists
if (!fs.existsSync(hookPath)) {
  throw new Error('Hook file not found');
}

// Test 2: Valid JavaScript
const { execSync } = require('child_process');
execSync(`node --check "${hookPath}"`);

console.log('✅ All tests passed');
```

Add your test to the Makefile:
```makefile
test-hooks: ## Run PocketBase hook validation tests
	node tests/hooks/test-my-hook.js
	node tests/hooks/test-notification-hook.js
```

## Cron Schedule Format

Cron jobs use standard cron syntax:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

**Common schedules:**
- `0 9 * * *` - Daily at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 0 1 * *` - Monthly on the 1st at midnight
- `*/15 * * * *` - Every 15 minutes

## Security Best Practices

1. **Never commit secrets** - Use environment variables for sensitive data
2. **Validate input** - Always validate data from API endpoints
3. **Use authentication** - Protect endpoints with `$apis.requireAdminAuth()` or `$apis.requireRecordAuth()`
4. **Sanitize output** - Prevent XSS in notification payloads
5. **Rate limiting** - Implement rate limits for public endpoints
6. **Error handling** - Use try-catch blocks to prevent crashes
7. **Logging** - Log errors but don't expose sensitive information

## Resources

- [PocketBase Hooks Documentation](https://pocketbase.io/docs/js-overview/)
- [PocketBase Event Hooks](https://pocketbase.io/docs/js-event-hooks/)
- [PocketBase Routing](https://pocketbase.io/docs/js-routing/)
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [Cron Expression Guide](https://crontab.guru/)

## Support

For issues with hooks:

1. Check PocketBase logs for errors
2. Run `make test-hooks` to validate hook syntax
3. Verify environment variables are set
4. Check that required npm packages are installed
5. Review this README for troubleshooting steps

---

**Note:** Hooks are loaded automatically when PocketBase starts. Restart PocketBase after modifying hooks.
