/**
 * Charitable tab E2E — CRUD, and the year arithmetic someone would copy onto a
 * tax return.
 */

import { test } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { CharitablePage } from './CharitablePage';
import {
  createCharitableReceipt,
  deleteAllCharitableReceipts,
  testCharitableReceipts,
} from './helpers';

/** 2025 in the fixtures: 400 less 60 received, plus 75, plus an unvalued gift. */
const TOTAL_2025 = 415;
const TOTAL_2024 = 90;

test.describe('Charitable CRUD', () => {
  let charitablePage: CharitablePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    charitablePage = new CharitablePage(authenticatedPage);
    await deleteAllCharitableReceipts(userToken);
    await charitablePage.goto();
  });

  test('should create a donation', async () => {
    await charitablePage.createDonation({
      organization: 'City Food Bank',
      donation_date: '2025-06-01',
      gift_type: 'Cash',
      amount: 120,
      donor: 'Self',
    });

    await charitablePage.expectDonationInList('City Food Bank', 120);
  });

  test('should subtract what was received in return from the deduction', async () => {
    await charitablePage.createDonation({
      organization: 'Gala Charity',
      donation_date: '2025-04-10',
      gift_type: 'Cash',
      amount: 250,
      value_received: 60,
    });

    // 250 given, 60 received back — the deduction is 190, not 250.
    await charitablePage.expectDonationInList('Gala Charity', 190);
  });

  test('should total a year net of benefits received', async ({ userToken }) => {
    for (const receipt of testCharitableReceipts) {
      await createCharitableReceipt(userToken, receipt);
    }

    await charitablePage.goto(2025);
    await charitablePage.expectDeductibleTotal(TOTAL_2025);
  });

  test('should switch years from the by-year table', async ({ userToken }) => {
    for (const receipt of testCharitableReceipts) {
      await createCharitableReceipt(userToken, receipt);
    }

    await charitablePage.goto(2025);
    await charitablePage.expectYearTotal(2024, TOTAL_2024);

    await charitablePage.selectYearFromTable(2024);
    await charitablePage.expectSelectedYear(2024);
    await charitablePage.expectDeductibleTotal(TOTAL_2024);
    // The 2024 donation is the only one in scope now.
    await charitablePage.expectDonationInList('Animal Rescue');
    await charitablePage.expectDonationNotInList('City Food Bank');
  });

  test('should switch years from the picker', async ({ userToken }) => {
    for (const receipt of testCharitableReceipts) {
      await createCharitableReceipt(userToken, receipt);
    }

    await charitablePage.goto(2025);
    await charitablePage.selectYear(2024);
    await charitablePage.expectDeductibleTotal(TOTAL_2024);
  });

  test('should ask for a value on a gift of goods rather than counting it as zero', async ({
    userToken,
  }) => {
    for (const receipt of testCharitableReceipts) {
      await createCharitableReceipt(userToken, receipt);
    }

    await charitablePage.goto(2025);
    await charitablePage.expectNeedsValue('Neighborhood Shelter');
  });

  test('should mark a donation as claimed', async ({ userToken }) => {
    await createCharitableReceipt(userToken, testCharitableReceipts[2]);

    await charitablePage.goto(2025);
    await charitablePage.expectDonationStatus('Public Library Fund', 'Unclaimed');

    await charitablePage.markDonationClaimed('Public Library Fund');
    await charitablePage.expectDonationStatus('Public Library Fund', 'Claimed');
  });

  test('should filter by status', async ({ userToken }) => {
    await createCharitableReceipt(userToken, testCharitableReceipts[2]);
    await createCharitableReceipt(userToken, {
      ...testCharitableReceipts[0],
      status: 'Claimed',
    });

    await charitablePage.goto(2025);

    await charitablePage.filterByStatus('Claimed');
    await charitablePage.expectDonationInList('City Food Bank');
    await charitablePage.expectDonationNotInList('Public Library Fund');

    await charitablePage.filterByStatus('Unclaimed');
    await charitablePage.expectDonationInList('Public Library Fund');
    await charitablePage.expectDonationNotInList('City Food Bank');
  });

  test('should leave a DAF grant out of the deduction and filter by source', async ({
    userToken,
  }) => {
    await createCharitableReceipt(userToken, {
      organization: 'City Food Bank',
      donation_date: '2025-06-01',
      gift_type: 'Cash',
      amount: 100,
      status: 'Unclaimed',
      source: 'Self',
    });
    await createCharitableReceipt(userToken, {
      organization: 'Public Radio',
      donation_date: '2025-07-01',
      gift_type: 'Cash',
      amount: 1000,
      status: 'Unclaimed',
      source: 'DAF',
    });

    await charitablePage.goto(2025);
    // The grant was deducted when the fund was funded — only the direct gift counts.
    await charitablePage.expectDeductibleTotal(100);

    await charitablePage.filterBySource('DAF');
    await charitablePage.expectDonationInList('Public Radio');
    await charitablePage.expectDonationNotInList('City Food Bank');

    await charitablePage.filterBySource('Self');
    await charitablePage.expectDonationInList('City Food Bank');
    await charitablePage.expectDonationNotInList('Public Radio');
  });

  test('should edit a donation', async ({ userToken }) => {
    await createCharitableReceipt(userToken, testCharitableReceipts[2]);

    await charitablePage.goto(2025);
    await charitablePage.editDonation('Public Library Fund', { amount: 500 });

    await charitablePage.expectDonationInList('Public Library Fund', 500);
    await charitablePage.expectDeductibleTotal(500);
  });

  test('should delete a donation', async ({ userToken }) => {
    await createCharitableReceipt(userToken, testCharitableReceipts[2]);

    await charitablePage.goto(2025);
    await charitablePage.deleteDonation('Public Library Fund');

    await charitablePage.expectDonationNotInList('Public Library Fund');
  });

  test('should be reachable from the medical tab', async ({ userToken }) => {
    await createCharitableReceipt(userToken, testCharitableReceipts[2]);

    await charitablePage.goViaTab();
    await charitablePage.expectDonationInList('Public Library Fund');
  });

  test('should handle empty state', async () => {
    await charitablePage.goto();
    await charitablePage.expectEmptyState();
  });
});
