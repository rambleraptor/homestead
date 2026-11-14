/**
 * Groceries — sorting the list by store section, on the VM tier.
 *
 * `groceries:categorize` puts one multiple-choice question per item to the
 * Gemini Decisions API and saves each answer as the item's `category`. The API
 * here is an in-process stand-in that answers from the item's name, so these
 * specs check the round trip — every item asked about, the answers saved, the
 * list redrawn in section order — not the model's judgement.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { registerService } from '@rambleraptor/homestead-test-harness/vm/fetch-shim';
import { e2eClient, postCustomMethod } from '../../../../tests/e2e/utils/aepbase-helpers';

const STUB_ORIGIN = 'http://decisions-stub.test';
const STUB_KEY = 'decisions-stub-key';

/** What the stand-in "knows": a word in the question → the section it picks. */
const SHELVES: Record<string, string> = { milk: 'dairy-eggs', apples: 'produce', bread: 'bakery' };

interface StubRequest {
  model: string;
  questions: Record<string, { type: string; instructions: string; criteria: Record<string, string> }>;
}

/** Serve the Decisions API in-process; returns the requests it received. */
function installDecisionsStub(): StubRequest[] {
  const requests: StubRequest[] = [];
  registerService(STUB_ORIGIN, async (request) => {
    if (request.headers.get('x-goog-api-key') !== STUB_KEY) {
      return Response.json({ error: { code: 'unauthenticated', message: 'API key not valid.' } }, { status: 401 });
    }
    const body = (await request.json()) as StubRequest;
    requests.push(body);
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([key, q]) => {
        const word = Object.keys(SHELVES).find((w) => q.instructions.toLowerCase().includes(w));
        const choice = word ? SHELVES[word] : 'other';
        return [key, { type: 'choice', choice, confidence: 0.95, probabilities: { [choice]: 0.95 } }];
      }),
    );
    return Response.json({ answers });
  });
  return requests;
}

interface GroceryRecord {
  id: string;
  name: string;
  checked: boolean;
  category?: string;
}

describe('Groceries — sort by section', () => {
  let h: Harness;
  let token: string;
  let requests: StubRequest[];

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
    requests = installDecisionsStub();
    process.env.GEMINI_DECISIONS_BASE_URL = STUB_ORIGIN;
    process.env.GEMINI_API_KEY = STUB_KEY;
  });

  afterEach(async () => {
    delete process.env.GEMINI_DECISIONS_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    await h.close();
  });

  const seed = async (...names: string[]) => {
    const groceries = e2eClient(token).collection<GroceryRecord>('groceries');
    for (const name of names) await groceries.create({ name });
    return groceries;
  };

  test('decides a section for every item in one request and saves it', async () => {
    const groceries = await seed('2 gallons milk', 'Apples', 'Birthday candles');

    const res = await postCustomMethod(token, '/groceries:categorize', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sorted: 3, changed: 3 });

    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe('gemini-decision-1');
    expect(Object.keys(requests[0].questions)).toHaveLength(3);

    const saved = new Map((await groceries.listAll()).map((item) => [item.name, item.category]));
    expect(saved.get('2 gallons milk')).toBe('dairy-eggs');
    expect(saved.get('Apples')).toBe('produce');
    expect(saved.get('Birthday candles')).toBe('other');

    // A second pass has nothing to change.
    const again = await postCustomMethod(token, '/groceries:categorize', {});
    expect(await again.json()).toMatchObject({ sorted: 3, changed: 0 });
  });

  test('says what is missing when there is no Gemini key', async () => {
    delete process.env.GEMINI_API_KEY;
    await seed('Milk');

    const res = await postCustomMethod(token, '/groceries:categorize', {});
    expect(res.status).toBe(503);
    expect(((await res.json()) as { detail: string }).detail).toMatch(/Gemini API key/);
  });

  test("passes on the API's refusal instead of failing silently", async () => {
    process.env.GEMINI_API_KEY = 'wrong-key';
    await seed('Milk');

    const res = await postCustomMethod(token, '/groceries:categorize', {});
    expect(res.status).toBe(424);
    expect(((await res.json()) as { detail: string }).detail).toMatch(/API key not valid/);
  });

  test('the menu sorts the list into sections, in walking order', async () => {
    await seed('Milk', 'Apples', 'Bread');
    const d = h.driver;
    await d.goto('/groceries');
    await d.expect(d.getByText('Milk')).toBeVisible();
    // A list nobody has sorted draws no section headings.
    await d.expect(d.getByTestId('grocery-section-heading')).toHaveCount(0);

    await d.getByTestId('groceries-menu-button').click();
    await d.getByTestId('sort-groceries-button').click();

    const headings = d.getByTestId('grocery-section-heading');
    await d.expect(headings).toHaveCount(3);
    await d.expect(headings.nth(0)).toHaveText('Produce');
    await d.expect(headings.nth(1)).toHaveText('Bakery');
    await d.expect(headings.nth(2)).toHaveText('Dairy & Eggs');

    const rows = d.getByTestId('grocery-item');
    await d.expect(rows.nth(0)).toContainText('Apples');
    await d.expect(rows.nth(1)).toContainText('Bread');
    await d.expect(rows.nth(2)).toContainText('Milk');

    // An item added afterwards lands at the top, unsorted, with nothing more to fill in.
    await d.getByTestId('quick-add-input').fill('Zucchini');
    await d.getByRole('button', { name: 'Add item' }).click();
    await d.expect(rows.nth(0)).toContainText('Zucchini');
    await d.expect(headings).toHaveCount(3);
  });
});
