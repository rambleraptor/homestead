/**
 * Receipts E2E helpers — seed medical receipts (multipart-file uploads) and
 * charitable ones (plain JSON) via the aepbase REST API, plus the test data
 * both specs use.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

interface CreateHSAReceiptInput {
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  patient?: string;
  status: 'Stored' | 'Reimbursed';
  notes?: string;
}

export interface HSAReceiptRecord {
  id: string;
  merchant: string;
  service_date: string;
  amount: number;
  category: 'Medical' | 'Dental' | 'Vision' | 'Rx';
  status: 'Stored' | 'Reimbursed';
  patient?: string;
  notes?: string;
}

export async function createHSAReceipt(
  token: string,
  data: CreateHSAReceiptInput,
): Promise<HSAReceiptRecord> {
  // Minimal valid JPEG (required file field).
  const jpegBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const resource: Record<string, unknown> = {
    merchant: data.merchant,
    service_date: data.service_date,
    amount: data.amount,
    category: data.category,
    status: data.status,
  };
  if (data.patient) resource.patient = data.patient;
  if (data.notes) resource.notes = data.notes;

  const formData = new FormData();
  formData.append('resource', JSON.stringify(resource));
  formData.append('receipt_file', blob, 'test-receipt.jpg');

  return e2eClient(token).collection<HSAReceiptRecord>('hsa-receipts').create(formData);
}

export async function createMultipleHSAReceipts(
  token: string,
  receipts: Array<CreateHSAReceiptInput>,
) {
  const results = [];
  for (const receipt of receipts) {
    results.push(await createHSAReceipt(token, receipt));
  }
  return results;
}

export const testHSAReceipts = [
  {
    merchant: 'CVS Pharmacy',
    service_date: '2024-01-15',
    amount: 45.99,
    category: 'Rx' as const,
    patient: 'Self',
    status: 'Stored' as const,
    notes: 'Prescription refill',
  },
  {
    merchant: 'Dr. Smith Dental',
    service_date: '2024-02-20',
    amount: 250.0,
    category: 'Dental' as const,
    patient: 'Child',
    status: 'Stored' as const,
    notes: 'Cavity filling',
  },
  {
    merchant: 'Vision Center',
    service_date: '2024-03-10',
    amount: 150.0,
    category: 'Vision' as const,
    patient: 'Spouse',
    status: 'Stored' as const,
    notes: 'Eye exam and glasses',
  },
  {
    merchant: 'ABC Medical Clinic',
    service_date: '2024-01-05',
    amount: 125.0,
    category: 'Medical' as const,
    patient: 'Self',
    status: 'Reimbursed' as const,
    notes: 'Annual checkup',
  },
];

// ---------------------------------------------------------------------------
// Charitable receipts
// ---------------------------------------------------------------------------

interface CreateCharitableReceiptInput {
  organization: string;
  donation_date: string;
  gift_type: 'Cash' | 'Goods' | 'Other';
  status: 'Unclaimed' | 'Claimed';
  source?: 'Self' | 'DAF';
  amount?: number;
  value_received?: number;
  tax_year?: number;
  description_of_property?: string;
  donor?: string;
  notes?: string;
}

export interface CharitableReceiptRecord extends CreateCharitableReceiptInput {
  id: string;
}

/**
 * Seed a donation. Unlike an HSA receipt, the acknowledgment file is optional
 * (a donation is often recorded before its letter arrives), so this posts plain
 * JSON — the multipart path is exercised through the UI instead.
 */
export async function createCharitableReceipt(
  token: string,
  data: CreateCharitableReceiptInput,
): Promise<CharitableReceiptRecord> {
  return e2eClient(token)
    .collection<CharitableReceiptRecord>('charitable-receipts')
    .create({ ...data });
}

/**
 * Two years of giving. The 2025 rows exercise every rule the tab has: a gift
 * reduced by what was received back, a gift of goods with no value on it, and
 * a plain cash gift. 2024 exists so the by-year table has a second row.
 */
export const testCharitableReceipts = [
  {
    organization: 'City Food Bank',
    donation_date: '2025-06-01T00:00:00.000Z',
    gift_type: 'Cash' as const,
    amount: 400,
    value_received: 60, // deductible: 340
    status: 'Unclaimed' as const,
    donor: 'Self',
  },
  {
    organization: 'Neighborhood Shelter',
    donation_date: '2025-09-14T00:00:00.000Z',
    gift_type: 'Goods' as const,
    description_of_property: '3 bags of clothing',
    status: 'Unclaimed' as const,
  },
  {
    organization: 'Public Library Fund',
    donation_date: '2025-11-02T00:00:00.000Z',
    gift_type: 'Cash' as const,
    amount: 75,
    status: 'Unclaimed' as const,
  },
  {
    organization: 'Animal Rescue',
    donation_date: '2024-02-02T00:00:00.000Z',
    gift_type: 'Cash' as const,
    amount: 90,
    status: 'Claimed' as const,
  },
];
