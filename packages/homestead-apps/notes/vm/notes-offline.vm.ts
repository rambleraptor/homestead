/**
 * Notes as a native notebook, on the VM tier: the time a note was written,
 * what's waiting to sync, edits from two devices, half-finished edits, and the
 * dashboard's write box. "Offline" is React Query's online state, which the
 * outbox follows — the VM has no network to cut.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../../../../tests/e2e/pages/DashboardPage';
import { NotesPage } from '../e2e/NotesPage';
import { createNote, listNotes, updateNote } from '../e2e/helpers';

describe('Notes offline and across devices', () => {
  let h: Harness;
  let notes: NotesPage;
  let token: string;
  let userId: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
    userId = h.member.id;
    notes = new NotesPage(h.driver);
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    await h.close();
  });

  test('a note keeps the time it was written', async () => {
    await notes.goto();
    const before = new Date().toISOString();
    await notes.write('Stamped');
    const [saved] = await expect.poll(() => listNotes(token, userId)).toHaveLength(1).then(() => listNotes(token, userId));
    expect(saved!.written_at).toBeDefined();
    expect(saved!.written_at! >= before).toBe(true);
  });

  test('shows what is waiting to sync, and clears it once sent', async () => {
    await notes.goto();
    onlineManager.setOnline(false);

    await notes.write('Written in a tunnel');
    await notes.expectNote('Written in a tunnel');
    await h.driver.expect(notes.pendingMark('Written in a tunnel')).toBeVisible();
    await h.driver.expect(notes.syncStatus).toHaveText('Offline · 1 change will sync');
    expect(await listNotes(token, userId)).toHaveLength(0);

    onlineManager.setOnline(true);
    await h.driver.expect(notes.syncStatus).toHaveCount(0);
    await h.driver.expect(notes.pendingMark('Written in a tunnel')).toHaveCount(0);
    await expect.poll(async () => (await listNotes(token, userId)).length).toBe(1);
  });

  test('an offline edit to a note changed elsewhere is kept as a copy', async () => {
    const seeded = await createNote(token, userId, { body: 'Shopping: milk' });
    await notes.goto();
    onlineManager.setOnline(false);

    await notes.edit('Shopping: milk', 'Shopping: milk, eggs');
    // Meanwhile, on another device, the same note changes.
    await updateNote(token, userId, seeded.id, { body: 'Shopping: milk, bread' });

    onlineManager.setOnline(true);
    await h.driver.expect(h.driver.getByText(/saved as a copy/)).toBeVisible();
    await expect
      .poll(async () => (await listNotes(token, userId)).map((n) => n.body).sort())
      .toEqual(['Shopping: milk, bread', 'Shopping: milk, eggs']);
    await notes.expectNote('Shopping: milk, bread');
    await notes.expectNote('Shopping: milk, eggs');
  });

  test('a half-finished edit survives a reload', async () => {
    await createNote(token, userId, { body: 'Call the vet' });
    await notes.goto();
    await notes.startEditing('Call the vet', 'Call the vet about Rex');
    await h.driver.reload();
    await notes.expectEditing('Call the vet about Rex');
  });

  test('writes a note from the dashboard', async () => {
    const dashboard = new DashboardPage(h.driver);
    await h.driver.goto('/dashboard');
    await dashboard.widgetChip('notes-capture').click();
    const panel = dashboard.widgetPanel;
    await panel.getByTestId('notes-composer-input').fill('From the home screen');
    await panel.getByTestId('notes-composer-submit').click();
    await h.driver.expect(panel.getByTestId('notes-widget-note').filter({ hasText: 'From the home screen' })).toBeVisible();
    await expect.poll(async () => (await listNotes(token, userId)).map((n) => n.body)).toEqual([
      'From the home screen',
    ]);
  });
});
