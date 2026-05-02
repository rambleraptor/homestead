# HSA Module

Track unreimbursed medical expenses for tax-free HSA withdrawals.

## Overview

The HSA (Health Savings Account) module helps you track out-of-pocket medical expenses that you've paid with personal funds. These expenses can be reimbursed from your HSA at any time in the future, tax-free. The module calculates your "Liquidatable Tax-Free Cash" - the total amount you can withdraw from your HSA.

## Features

### 📊 KPI Dashboard
- **Liquidatable Tax-Free Cash**: Prominently displays the total amount available for tax-free withdrawal
- Real-time calculation based on stored (unreimbursed) receipts
- Summary statistics showing stored vs. reimbursed receipts

### 📸 AI-Powered Receipt Parsing
- Upload receipt images (JPEG, PNG, WebP, GIF) or PDFs
- Click "Parse Receipt with AI" to automatically extract:
  - Merchant/Provider name
  - Service date
  - Amount paid
  - Category (Medical, Dental, Vision, Rx)
  - Patient name (if visible)
- Powered by Google Gemini 2.5 Flash vision model

### 📝 Quick Capture Form
- Simple, clean form for adding receipts
- Required fields: Merchant, Service Date, Amount, Category, Receipt File
- Optional fields: Patient, Notes
- File upload with validation (max 10MB)
- Real-time form validation

### 🗂️ Audit Vault
- Comprehensive table view of all receipts
- Filter by status: All, Stored, Reimbursed
- Columns: Date, Merchant, Amount, Category, Patient, Receipt (link), Status, Actions
- Direct links to view uploaded receipt files
- "Mark as Reimbursed" button to update receipt status
- Delete functionality with confirmation

## File Storage

### Where Uploads Are Stored

Receipt files are stored by PocketBase in the `pb_data/storage/` directory:

```
pocketbase/
└── pb_data/
    └── storage/
        └── <collection_id>/
            └── <record_id>/
                └── <filename>
```

For example:
```
pb_data/storage/abc123_hsa_receipts/xyz789_record/receipt_20240115.jpg
```

### Accessing Files

Files are served by PocketBase through its built-in file server:

```typescript
import { pb } from '@/core/api/pocketbase';

// Get URL for a receipt file
const url = pb.files.getUrl(receipt, receipt.receipt_file);
```

The URL format is:
```
http://127.0.0.1:8090/api/files/<collection>/<record_id>/<filename>
```

### File Security

- Files are protected by PocketBase's collection rules
- Users can only access files from their own records
- Authentication is required to view/download files

### Backup Considerations

When backing up your Homestead data, make sure to include the entire `pb_data/` directory:
- `pb_data/data.db` - SQLite database with receipt metadata
- `pb_data/storage/` - Actual receipt files

## API Endpoints

### Parse Receipt
```
POST /api/hsa/parse-receipt
Authorization: Bearer <token>
Content-Type: application/json

{
  "image": "<base64_encoded_image>",
  "mimeType": "image/jpeg"
}

Response:
{
  "data": {
    "merchant": "CVS Pharmacy",
    "service_date": "2024-01-15",
    "amount": 45.99,
    "category": "Rx",
    "patient": "John Smith"
  },
  "message": "Receipt parsed successfully"
}
```

### CRUD Operations

All CRUD operations use the standard PocketBase SDK through React Query hooks:

- `useHSAReceipts()` - Fetch all receipts
- `useHSAStats()` - Get calculated statistics
- `useCreateHSAReceipt()` - Create new receipt
- `useUpdateHSAReceipt()` - Update receipt (mark as reimbursed)
- `useDeleteHSAReceipt()` - Delete receipt

## Database Schema

Collection: `hsa_receipts`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| merchant | text | Yes | Provider name (e.g., "CVS Pharmacy") |
| service_date | date | Yes | Date of service |
| amount | number | Yes | Amount paid (min: 0) |
| category | select | Yes | Medical, Dental, Vision, or Rx |
| patient | text | No | Patient name |
| status | select | Yes | Stored or Reimbursed |
| receipt_file | file | Yes | Image or PDF (max 10MB) |
| notes | text | No | Additional notes |
| created_by | relation | No | User who created the record |

## Usage

1. **Add a Receipt**:
   - Click "Add Receipt" in the Quick Capture section
   - Upload your receipt image or PDF
   - For images, click "Parse Receipt with AI" to auto-fill fields
   - Review and adjust the parsed data
   - Click "Save Receipt"

2. **Mark as Reimbursed**:
   - When you withdraw money from your HSA
   - Find the receipt in the Audit Vault
   - Click "Mark Reimbursed"
   - The receipt is removed from the Liquidatable Cash total

3. **Filter Receipts**:
   - Use the dropdown in the Audit Vault
   - View "All", "Stored", or "Reimbursed" receipts

4. **View Receipt**:
   - Click the "View" link in the Receipt column
   - Opens the receipt file in a new tab

## Development

### Adding New Features

The module follows the standard Homestead module pattern:

```
src/modules/hsa/
├── components/           # UI components
├── hooks/               # React Query hooks
├── types.ts            # TypeScript types
├── module.config.ts    # Module metadata
└── index.ts            # Public exports
```

### Testing

Run tests with:
```bash
make test
```

## Configuration

### Gemini API Key

To enable AI receipt parsing, set the Gemini API key:

```bash
# In frontend/.env
GEMINI_API_KEY=your_api_key_here
```

Get an API key at: https://makersuite.google.com/app/apikey

### PocketBase URL

The module uses the standard PocketBase configuration:

```bash
# In frontend/.env
NEXT_PUBLIC_POCKETBASE_URL=/api/pb
```

## Tips

1. **Better Parsing Results**: Take clear, well-lit photos of receipts with all text visible
2. **Manual Review**: Always review AI-parsed data before saving
3. **Organize Receipts**: Use the Patient field to track expenses by family member
4. **Regular Backups**: Keep receipts stored for IRS audit purposes (typically 3-7 years)
5. **Notes Field**: Add context like "vision exam" or "prescription refill" for future reference
