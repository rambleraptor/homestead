/**
 * Edits an existing donation's metadata via `SchemaForm`.
 *
 * The acknowledgment file itself isn't editable here (updates go over a JSON
 * PATCH), so `receipt_file` and `source_document` are hidden. `status` is
 * shown, unlike on create — this is where a donation is marked as claimed by
 * hand, and where a mirrored gift of goods finally gets its value.
 */

import { SchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { PersonReferenceField } from '../../../people/components/PersonReferenceField';
import { charitableResources } from '../resources';
import type { CharitableReceipt } from '../types';

const charitableReceiptDef = charitableResources.find(
  (r) => r.singular === 'charitable-receipt',
)!;

interface CharitableEditFormProps {
  receipt: CharitableReceipt;
  onSubmit: (data: Partial<CharitableReceipt>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function CharitableEditForm({
  receipt,
  onSubmit,
  onCancel,
  isSubmitting,
}: CharitableEditFormProps) {
  return (
    <SchemaForm<Partial<CharitableReceipt>>
      resource={charitableReceiptDef}
      mode="edit"
      // A receipt from before `source` existed was paid directly; show it so.
      initialData={{ ...receipt, source: receipt.source ?? 'Self' }}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitTestId="charitable-receipt-edit-submit"
      submitLabel="Save Changes"
      layout={{
        order: [
          'organization',
          'donation_date',
          'gift_type',
          'source',
          'amount',
          'description_of_property',
          'value_received',
          'status',
          'tax_year',
          'organization_ein',
          'donor',
          'person',
          'goods_or_services',
          'notes',
        ],
      }}
      fields={{
        organization: { id: 'edit-organization', label: 'Organization' },
        donation_date: { id: 'edit-donation_date', label: 'Donation Date' },
        gift_type: { id: 'edit-gift_type', label: 'Gift Type' },
        source: { id: 'edit-source', label: 'Paid by' },
        amount: { id: 'edit-amount', widget: 'currency', placeholder: '0.00' },
        description_of_property: {
          id: 'edit-description_of_property',
          label: 'Donated goods',
          hidden: (values) => values.gift_type === 'Cash',
          colSpan: 2,
        },
        value_received: {
          id: 'edit-value_received',
          label: 'Value received in return',
          widget: 'currency',
          placeholder: '0.00',
        },
        status: { id: 'edit-status' },
        tax_year: { id: 'edit-tax_year', label: 'Tax year', widget: 'number' },
        organization_ein: { id: 'edit-organization_ein', label: 'EIN' },
        donor: { id: 'edit-donor', label: 'Donor' },
        person: {
          id: 'edit-person',
          widget: PersonReferenceField,
          bare: true,
          collection: 'people',
          testId: 'charitable-receipt-edit-person',
          emptyMessage: 'No people found — add them in the People app.',
        },
        goods_or_services: {
          id: 'edit-goods_or_services',
          label: 'Goods or services received',
          widget: 'textarea',
          colSpan: 2,
        },
        notes: { id: 'edit-notes', widget: 'textarea', colSpan: 2 },
        receipt_file: { hidden: true },
        source_document: { hidden: true },
      }}
    />
  );
}
