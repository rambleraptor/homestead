/**
 * Manual create path for a charitable receipt, built on `SchemaForm` over the
 * charitable-receipt schema.
 *
 * Two fields are conditional on the kind of gift, because asking for both at
 * once is asking a question the paperwork never answers: a cash gift states an
 * amount and no description; a gift of goods describes what was given and
 * leaves the valuation to the donor.
 *
 * `status` isn't shown (a new donation is Unclaimed) and the acknowledgment
 * file is optional — a donation is often entered before its letter arrives.
 */

import { SchemaForm, fileField } from '@rambleraptor/homestead-core/shared/forms';
import { PersonReferenceField } from '../../../people/components/PersonReferenceField';
import { charitableResources } from '../resources';
import type { CharitableReceiptFormData } from '../types';

const charitableReceiptDef = charitableResources.find(
  (r) => r.singular === 'charitable-receipt',
)!;

/** Image-or-PDF acknowledgment upload (10MB). Module-scoped for stable identity. */
const acknowledgmentFileField = fileField({
  accept: 'image/jpeg,image/png,image/webp,image/gif,application/pdf',
  maxSizeBytes: 10_485_760,
  hint: 'Image or PDF, max 10MB',
  preview: 'auto',
});

/** True while the form is describing a gift that isn't cash. */
const isNonCash = (values: Record<string, unknown>) => values.gift_type !== 'Cash';

interface CharitableCaptureFormProps {
  onSubmit: (data: CharitableReceiptFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function CharitableCaptureForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: CharitableCaptureFormProps) {
  return (
    <SchemaForm<CharitableReceiptFormData>
      resource={charitableReceiptDef}
      mode="create"
      onSubmit={(data) => onSubmit({ ...data, status: 'Unclaimed' })}
      onCancel={onCancel}
      isSubmitting={isSubmitting}
      submitTestId="charitable-receipt-form-submit"
      submitLabel="Save Donation"
      layout={{
        order: [
          'organization',
          'donation_date',
          'gift_type',
          'source',
          'amount',
          'description_of_property',
          'value_received',
          'tax_year',
          'organization_ein',
          'donor',
          'person',
          'goods_or_services',
          'receipt_file',
          'notes',
        ],
      }}
      fields={{
        organization: {
          id: 'organization',
          label: 'Organization',
          placeholder: 'Food bank, school, church, etc.',
        },
        donation_date: { id: 'donation_date', label: 'Donation Date' },
        gift_type: { id: 'gift_type', label: 'Gift Type', default: 'Cash' },
        source: {
          id: 'source',
          label: 'Paid by',
          default: 'Self',
          help: 'Self if you paid the charity directly. DAF if it was a grant from a donor-advised fund — not deductible, since the deduction was taken when the fund was funded.',
        },
        amount: {
          id: 'amount',
          widget: 'currency',
          placeholder: '0.00',
          help: 'What you are claiming. For a gift of goods, your own valuation — the charity will not have given one.',
        },
        description_of_property: {
          id: 'description_of_property',
          label: 'Donated goods',
          placeholder: '3 bags of clothing, a desk, …',
          hidden: (values) => !isNonCash(values),
          colSpan: 2,
        },
        value_received: {
          id: 'value_received',
          label: 'Value received in return',
          widget: 'currency',
          placeholder: '0.00',
          help: 'Only if the charity gave something back — a dinner, a tote bag. It comes off the deduction.',
        },
        tax_year: {
          id: 'tax_year',
          label: 'Tax year',
          widget: 'number',
          help: 'Only when it differs from the donation date — a check mailed in December, acknowledged in January.',
        },
        organization_ein: {
          id: 'organization_ein',
          label: 'EIN',
          placeholder: '12-3456789',
        },
        donor: { id: 'donor', label: 'Donor', placeholder: 'As printed on the receipt' },
        person: {
          id: 'person',
          widget: PersonReferenceField,
          bare: true,
          collection: 'people',
          testId: 'charitable-receipt-person',
          emptyMessage: 'No people found — add them in the People app.',
        },
        goods_or_services: {
          id: 'goods_or_services',
          label: 'Goods or services received',
          widget: 'textarea',
          colSpan: 2,
          placeholder:
            'What the acknowledgment says you got back — usually "no goods or services were provided".',
        },
        receipt_file: {
          id: 'receipt_file',
          label: 'Acknowledgment',
          widget: acknowledgmentFileField,
          bare: true,
          colSpan: 2,
        },
        notes: {
          id: 'notes',
          widget: 'textarea',
          colSpan: 2,
          placeholder: 'Anything worth remembering about this donation...',
        },
        status: { hidden: true },
        source_document: { hidden: true },
      }}
    />
  );
}
