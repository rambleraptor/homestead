/**
 * Tests for the dual-write helpers used by people module hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import {
  upsertBirthdayEvent,
  upsertAnniversaryEvent,
} from '../utils/personEventSync';

describe('personEventSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aepbase.getCurrentUser).mockReturnValue({
      id: 'u1',
      email: 'u@x.com',
      username: 'u@x.com',
      name: '',
      verified: true,
      created: '',
      updated: '',
    });
  });

  it('creates a new birthday event when none exists', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([]);
    vi.mocked(aepbase.create).mockResolvedValueOnce({ id: 'ev1' });

    await upsertBirthdayEvent('p1', 'John', '1990-06-20');

    expect(aepbase.create).toHaveBeenCalledWith(
      'events',
      expect.objectContaining({
        name: "John's Birthday",
        date: '1990-06-20',
        tag: 'birthday',
        people: ['people/p1'],
        created_by: 'users/u1',
      }),
    );
  });

  it('updates an existing birthday event for the same person', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([
      {
        id: 'ev-existing',
        name: "John's Birthday",
        date: '1990-06-20',
        tag: 'birthday',
        people: ['people/p1'],
      },
    ]);
    vi.mocked(aepbase.update).mockResolvedValueOnce({ id: 'ev-existing' });

    await upsertBirthdayEvent('p1', 'Johnny', '1990-07-21');

    expect(aepbase.update).toHaveBeenCalledWith(
      'events',
      'ev-existing',
      expect.objectContaining({
        name: "Johnny's Birthday",
        date: '1990-07-21',
        people: ['people/p1'],
      }),
    );
    expect(aepbase.create).not.toHaveBeenCalled();
  });

  it('deletes the matching event when birthday is cleared', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([
      {
        id: 'ev-existing',
        name: "John's Birthday",
        date: '1990-06-20',
        tag: 'birthday',
        people: ['people/p1'],
      },
    ]);

    await upsertBirthdayEvent('p1', 'John', undefined);

    expect(aepbase.remove).toHaveBeenCalledWith('events', 'ev-existing');
    expect(aepbase.create).not.toHaveBeenCalled();
    expect(aepbase.update).not.toHaveBeenCalled();
  });

  it('matches anniversary events by sorted person ids regardless of order', async () => {
    vi.mocked(aepbase.list).mockResolvedValueOnce([
      {
        id: 'ev-existing',
        name: "John's Anniversary",
        date: '2010-08-15',
        tag: 'anniversary',
        people: ['people/p2', 'people/p1'],
      },
    ]);
    vi.mocked(aepbase.update).mockResolvedValueOnce({ id: 'ev-existing' });

    await upsertAnniversaryEvent(['p1', 'p2'], 'John', '2010-08-15');

    expect(aepbase.update).toHaveBeenCalledWith(
      'events',
      'ev-existing',
      expect.objectContaining({
        people: ['people/p1', 'people/p2'],
      }),
    );
  });

  it('no-ops when given empty person id list', async () => {
    await upsertAnniversaryEvent([], 'John', '2010-08-15');
    expect(aepbase.list).not.toHaveBeenCalled();
    expect(aepbase.create).not.toHaveBeenCalled();
  });

  it('swallows errors from the events write so legacy field keeps flowing', async () => {
    vi.mocked(aepbase.list).mockRejectedValueOnce(new Error('boom'));
    await expect(
      upsertBirthdayEvent('p1', 'John', '1990-06-20'),
    ).resolves.toBeUndefined();
  });
});
