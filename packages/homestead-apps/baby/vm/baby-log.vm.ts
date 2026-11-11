/**
 * The baby log, on the VM tier: setting up, one-tap logging, the status
 * tiles, bottles, editing and deleting, looking back a day, and sharing with
 * the household. Each test boots from a fresh copy of the template database,
 * so there is no cleanup.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { BabyPage } from '../e2e/BabyPage';
import { createBaby, createBabyEvent, listBabyEvents, minutesAgo } from '../e2e/helpers';

describe('Baby log', () => {
  let h: Harness;
  let baby: BabyPage;
  let token: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
    baby = new BabyPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('sets up a baby on the first visit, and insists on a name', async () => {
    await baby.gotoSetup();

    await baby.fillBaby('');
    await h.driver.expect(h.driver.getByTestId('baby-name-error')).toBeVisible();

    await baby.fillBaby('Juniper');
    await baby.expectBabyName('Juniper');
    await baby.expectStatus('feed', 'No feeds yet');
    await baby.expectStatus('sleep', 'No sleep logged yet');
  });

  test('logs a diaper with one tap, and takes it back with undo', async () => {
    const { id } = await createBaby(token);
    await baby.goto();

    await baby.logDiaper('wet');

    await baby.expectRow('Wet diaper');
    await baby.expectStatus('diaper', 'just now');
    await baby.expectTotals('1 wet');
    await expect.poll(async () => (await listBabyEvents(token, id)).map((e) => e.diaper)).toEqual(['wet']);
    const [logged] = await listBabyEvents(token, id);
    expect(logged?.kind).toBe('diaper');
    expect(Date.now() - new Date(logged?.started_at ?? 0).getTime()).toBeLessThan(60_000);

    await baby.undo();
    await baby.expectNoRow('Wet diaper');
    await expect.poll(async () => (await listBabyEvents(token, id)).length).toBe(0);
  });

  test('shows where things stand from what was logged earlier', async () => {
    const { id } = await createBaby(token);
    await createBabyEvent(token, id, {
      kind: 'feed',
      feed_method: 'bottle',
      amount: 4,
      amount_unit: 'oz',
      contents: 'formula',
      started_at: minutesAgo(130),
    });
    await createBabyEvent(token, id, { kind: 'diaper', diaper: 'dirty', started_at: minutesAgo(45) });
    await createBabyEvent(token, id, {
      kind: 'sleep',
      started_at: minutesAgo(100),
      ended_at: minutesAgo(20),
    });
    await baby.goto();

    await baby.expectStatus('feed', '2h 10m ago');
    await baby.expectStatus('feed', 'Bottle · 4 oz · formula');
    await baby.expectStatus('diaper', '45m ago');
    await baby.expectStatus('sleep', 'Awake');
    await baby.expectStatus('sleep', '20m');
  });

  test('toggles sleep: asleep, then awake, as one entry', async () => {
    const { id } = await createBaby(token);
    await baby.goto();

    await baby.toggleSleep();
    await baby.expectStatus('sleep', 'Asleep');
    await baby.expectRow('still asleep');
    await expect.poll(async () => (await listBabyEvents(token, id)).length).toBe(1);

    await baby.toggleSleep();
    await baby.expectStatus('sleep', 'Awake');
    await expect.poll(async () => !!(await listBabyEvents(token, id))[0]?.ended_at).toBe(true);
    expect(await listBabyEvents(token, id)).toHaveLength(1);
  });

  test('times a breast feed, and offers the other side next', async () => {
    const { id } = await createBaby(token);
    await baby.goto();

    await baby.tapSide('left');
    await baby.expectStatus('feed', 'Nursing · left');
    await h.driver.expect(h.driver.getByTestId('baby-log-feed-left')).toHaveText('Stop left');

    await baby.tapSide('left');
    await baby.expectStatus('feed', 'Nursed · left');
    await h.driver.expect(h.driver.getByTestId('baby-log-feed-right')).toContainText('next');
    await expect.poll(async () => (await listBabyEvents(token, id))[0]?.ended_at ?? '').not.toBe('');
    const [feed] = await listBabyEvents(token, id);
    expect(feed).toMatchObject({ kind: 'feed', feed_method: 'breast', side: 'left' });
  });

  test('logs a bottle with the amount as entered, and starts the next from it', async () => {
    const { id } = await createBaby(token);
    await baby.goto();

    await baby.openBottle();
    await baby.fillAmount('0');
    await baby.saveEvent();
    await h.driver.expect(h.driver.getByTestId('baby-event-amount-error')).toBeVisible();

    await baby.fillAmount('3.5');
    await baby.chooseContents('formula');
    await baby.saveEvent();

    await baby.expectEditorClosed();
    await baby.expectRow('Bottle · 3.5 oz · formula');
    await baby.expectTotals('3.5 oz');
    await expect.poll(async () => (await listBabyEvents(token, id))[0]?.amount).toBe(3.5);
    expect((await listBabyEvents(token, id))[0]).toMatchObject({ amount_unit: 'oz', contents: 'formula' });

    await baby.openBottle();
    await h.driver.expect(h.driver.getByTestId('baby-event-amount')).toHaveValue('3.5');
  });

  test('edits an entry and deletes one', async () => {
    const { id } = await createBaby(token);
    await createBabyEvent(token, id, { kind: 'diaper', diaper: 'wet', started_at: minutesAgo(0.01) });
    await createBabyEvent(token, id, { kind: 'sleep', started_at: minutesAgo(0.04), ended_at: minutesAgo(0.02) });
    await baby.goto();

    await baby.openRow('Wet diaper');
    await baby.chooseDiaper('both');
    await baby.fillNotes('Changed outfit too');
    await baby.saveEvent();
    await baby.expectRow('Wet and dirty diaper');
    await baby.expectRow('Changed outfit too');
    await expect
      .poll(async () => (await listBabyEvents(token, id)).find((e) => e.kind === 'diaper')?.diaper)
      .toBe('both');

    await baby.openRow('Sleep');
    await baby.deleteEvent();
    await baby.expectNoRow('Sleep');
    await expect.poll(async () => (await listBabyEvents(token, id)).map((e) => e.kind)).toEqual(['diaper']);
  });

  test('refuses an end before the start', async () => {
    const { id } = await createBaby(token);
    await createBabyEvent(token, id, { kind: 'sleep', started_at: minutesAgo(0.01) });
    await baby.goto();

    await baby.openRow('Sleep');
    await baby.fillEnded('2020-01-01T00:00');
    await baby.saveEvent();

    await h.driver.expect(h.driver.getByTestId('baby-event-ended-error')).toBeVisible();
    await h.driver.expect(baby.editor).toBeVisible();
  });

  test('looks back a day, and past the recent window', async () => {
    const { id } = await createBaby(token);
    await createBabyEvent(token, id, { kind: 'diaper', diaper: 'wet', started_at: minutesAgo(0.01) });
    const longAgo = new Date();
    longAgo.setDate(longAgo.getDate() - 16);
    longAgo.setHours(12, 0, 0, 0);
    await createBabyEvent(token, id, {
      kind: 'diaper',
      diaper: 'dirty',
      started_at: longAgo.toISOString(),
    });
    await baby.goto();
    await baby.expectDay('Today');
    await baby.expectRowCount(1);

    await baby.previousDay();
    await baby.expectDay('Yesterday');
    for (let i = 0; i < 15; i += 1) await baby.previousDay();

    await baby.expectRow('Dirty diaper');
    await baby.expectTotals('1 dirty');

    // An entry outside the working set can still be changed.
    await baby.openRow('Dirty diaper');
    await baby.chooseDiaper('wet');
    await baby.saveEvent();
    await baby.expectEditorClosed();
    await expect
      .poll(async () => (await listBabyEvents(token, id))[0]?.diaper)
      .toBe('wet');
  });

  test('is shared: what someone else logs shows up, with their name', async () => {
    const other = h.householdMember;
    const { id } = await createBaby(token, { name: 'Juniper', birth_date: '2020-01-01' });
    await createBabyEvent(other.token, id, {
      kind: 'diaper',
      diaper: 'wet',
      started_at: minutesAgo(0.02),
      created_by: `users/${other.id}`,
    });
    await baby.goto();

    await baby.expectRow('Wet diaper');
    await h.driver.expect(baby.rows('Wet diaper').first()).toContainText(other.name);

    // And live, while the page is open.
    await createBabyEvent(other.token, id, { kind: 'diaper', diaper: 'dirty', started_at: minutesAgo(0.01) });
    await baby.expectRow('Dirty diaper');
  });

  test('logs straight from a home-screen shortcut, once', async () => {
    const { id } = await createBaby(token);
    await baby.goto('?log=dirty');

    await baby.expectRow('Dirty diaper');
    await h.driver.expectURL(/\/baby$/);
    await expect.poll(async () => (await listBabyEvents(token, id)).length).toBe(1);

    await h.driver.reload();
    await baby.expectRow('Dirty diaper');
    await baby.expectRowCount(1);
  });

  test('renames the baby', async () => {
    await createBaby(token, { name: 'Baby' });
    await baby.goto();

    await baby.openBabyEditor();
    await baby.fillBaby('Juniper', '2026-12-10');
    await baby.expectBabyName('Juniper');
  });
});
