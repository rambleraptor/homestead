# Gift Cards Module

The Gift Cards module allows you to manage and track household gift cards, organizing them by merchant and keeping track of balances.

## Features

- **Add Gift Cards**: Input gift card numbers, PINs, amounts, and merchant information
- **Merchant View**: See all your gift cards organized by merchant with total balances
- **Detailed View**: Click on a merchant to see individual gift cards with secure PIN/number display
- **Edit & Delete**: Update gift card information or remove cards you've used
- **Statistics**: View total balance across all cards and merchant counts

## Usage

### Adding a Gift Card

1. Click the "Add Gift Card" button
2. Fill in the required fields:
   - **Merchant** (required): e.g., Amazon, Starbucks, Target
   - **Card Number** (required): The gift card number
   - **PIN** (optional): Security PIN if applicable
   - **Amount** (required): Current balance on the card
   - **Notes** (optional): Any additional information
3. Click "Add Card" to save

### Viewing Gift Cards by Merchant

- The main screen shows all merchants with:
  - Merchant name
  - Number of cards
  - Total balance across all cards for that merchant
- Click on any merchant to view individual gift cards

### Managing Individual Cards

In the merchant detail view, you can:
- **View card details**: Card number and PIN are masked by default
- **Show/Hide sensitive data**: Click the eye icon to reveal card numbers or PINs
- **Edit cards**: Click the edit icon to update card information
- **Delete cards**: Click the trash icon to remove a card

## Technical Details

### Database Schema

The module uses a `gift_cards` collection in PocketBase with the following fields:

- `merchant` (text, required, max 200): Merchant name
- `card_number` (text, required, max 100): Gift card number
- `pin` (text, optional, max 50): Security PIN
- `amount` (number, required, min 0): Current balance
- `notes` (text, optional, max 1000): Additional notes
- `created_by` (relation, optional): User who created the card (relates to users collection)
- `created`, `updated` (timestamps): Auto-managed by PocketBase

**Migration**: `pb_migrations/1733932805_gift_cards_collection.js`

**Indexes**:
- `idx_merchant` - Index on merchant field for faster filtering
- `idx_created_by` - Index on created_by field for ownership queries

See the full schema documentation in `docs/POCKETBASE_SCHEMA.md`.

### Components

- **GiftCardHome**: Main component that orchestrates the entire module
- **MerchantList**: Displays merchants with totals
- **MerchantDetail**: Shows individual gift cards for a merchant
- **GiftCardForm**: Form for creating and editing gift cards

### Hooks

- **useGiftCards**: Fetches all gift cards using React Query (sorted by ID descending)
- **useMerchantSummaries**: Computes merchant summaries and statistics from gift cards
- **useCreateGiftCard**: Mutation hook for creating new gift cards
- **useUpdateGiftCard**: Mutation hook for updating existing gift cards
- **useDeleteGiftCard**: Mutation hook for deleting gift cards

All hooks use TanStack Query (React Query) for automatic caching, refetching, and state management.

### Permissions

- **List/View**: All authenticated users can view gift cards
- **Create**: All authenticated users can add gift cards
- **Update**: Only the card creator or admins can edit cards
- **Delete**: Only the card creator or admins can delete cards

## Security Considerations

- Card numbers and PINs are masked by default in the UI
- Sensitive data must be explicitly revealed by clicking the show/hide toggle
- Access is restricted to authenticated users only
- Data is stored securely in PocketBase with proper API rules

## Future Enhancements

Potential improvements for future versions:

- [ ] Track card usage history
- [ ] Support for partial redemptions
- [ ] Expiration date tracking with alerts
- [ ] QR code/barcode storage and display
- [ ] Export to CSV
- [ ] Search and filter functionality
- [ ] Mobile app integration for quick access at checkout

## Testing

Tests are located in the `__tests__/` directory:

- Unit tests for hooks
- Component tests for UI interactions
- Integration tests for full workflows

Run tests with:

```bash
make test
```

## API Examples

### Creating a Gift Card

```typescript
const { mutateAsync } = useCreateGiftCard();

await mutateAsync({
  merchant: 'Amazon',
  card_number: '1234-5678-9012-3456',
  pin: '1234',
  amount: 50.00,
  notes: 'Birthday gift from Mom',
});
```

### Fetching Gift Cards

```typescript
const { data: giftCards, isLoading } = useGiftCards();
```

### Getting Merchant Summaries

```typescript
const { stats } = useMerchantSummaries();
// stats contains: totalCards, totalAmount, merchantCount, merchants[]
```

## Contributing

When modifying this module:

1. Follow the existing patterns for components and hooks
2. Maintain TypeScript types in `types.ts`
3. Add tests for new functionality
4. Update this README with any new features or changes
