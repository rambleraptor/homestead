# Next.js API Routes

This directory contains Next.js API routes that were migrated from PocketBase hooks.

## Migrated Routes

### Grocery APIs

#### `/api/groceries/categorize`
- **Method**: POST
- **Description**: Categorize a single grocery item using Google Gemini AI
- **Request Body**: `{ name: string }`
- **Response**: `{ name: string, category: GroceryCategory, message?: string }`
- **Authentication**: Required (PocketBase token in Authorization header)
- **Migrated from**: `pb_hooks/grocery_image_processor.pb.js`

#### `/api/groceries/process-image`
- **Method**: POST
- **Description**: Extract and categorize grocery items from an image using Gemini Vision AI
- **Request Body**: `{ image: string (base64), mimeType: string }`
- **Response**: `{ items: Array<{ name: string, category: string }>, message: string }`
- **Authentication**: Required (PocketBase token in Authorization header)
- **Migrated from**: `pb_hooks/grocery_image_processor.pb.js`

### Notification APIs

#### `/api/notifications/send-test`
- **Method**: POST
- **Description**: Manually trigger notification check for testing purposes
- **Response**: `{ success: boolean, message: string, timestamp: string }`
- **Authentication**: Required (Admin authentication)
- **Migrated from**: `pb_hooks/send_notifications.pb.js`

#### `/api/notifications/cron`
- **Method**: GET or POST
- **Description**: Scheduled endpoint for daily birthday/anniversary notifications
- **Response**: `{ success: boolean, message: string, timestamp: string }`
- **Authentication**: Optional CRON_SECRET header for external schedulers
- **Schedule**: Daily at 9:00 AM (configured in vercel.json)
- **Migrated from**: `pb_hooks/send_notifications.pb.js` (cron job)

## Environment Variables Required

### For Grocery APIs
- `GEMINI_API_KEY`: Google Gemini API key (required for AI categorization and image processing)
- `NEXT_PUBLIC_POCKETBASE_URL`: PocketBase server URL (for authentication)

### For Notification APIs
- `VAPID_PUBLIC_KEY`: VAPID public key for web push notifications
- `VAPID_PRIVATE_KEY`: VAPID private key for web push notifications
- `VAPID_EMAIL`: Contact email for VAPID (e.g., mailto:admin@example.com)
- `POCKETBASE_ADMIN_EMAIL`: PocketBase admin email (for accessing all people records)
- `POCKETBASE_ADMIN_PASSWORD`: PocketBase admin password
- `CRON_SECRET`: Optional secret for securing the cron endpoint (when not using Vercel Cron)
- `NEXT_PUBLIC_POCKETBASE_URL`: PocketBase server URL

## Authentication

All API routes verify authentication using PocketBase tokens passed in the `Authorization` header:

```
Authorization: Bearer <pocketbase-token>
```

The token is obtained from the PocketBase auth store in the frontend and included in all API requests.

## Cron Job Setup

### Vercel Deployment
If deploying to Vercel, the cron job is automatically configured via `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/notifications/cron",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### Other Deployments
For other deployment platforms, you can use an external cron service (e.g., cron-job.org) to call the endpoint:

```bash
curl -X POST https://your-domain.com/api/notifications/cron \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Set the `CRON_SECRET` environment variable to secure the endpoint.

## Migration Notes

- Frontend code updated to call Next.js API routes directly using `fetch()` instead of PocketBase's `pb.send()`
- All authentication is verified using PocketBase tokens
- Error handling and response formats maintained for backward compatibility
- Original PocketBase hooks can be removed once migration is verified
- Dependencies added: `web-push` and `@types/web-push`

## Testing

Test the APIs using curl or Postman:

```bash
# Get PocketBase auth token first
TOKEN="your-pocketbase-token"

# Test grocery categorization
curl -X POST http://localhost:3000/api/groceries/categorize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"apple"}'

# Test notification cron (admin only)
curl -X POST http://localhost:3000/api/notifications/send-test \
  -H "Authorization: Bearer $TOKEN"
```

## Frontend Integration

The frontend services have been updated to use these new routes:

- `src/core/services/gemini.ts` - Uses `/api/groceries/categorize` and `/api/groceries/process-image`
- `src/modules/settings/hooks/useSendTestNotification.ts` - Uses `/api/notifications/send-test`

All calls include the PocketBase auth token automatically.
