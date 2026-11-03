/**
 * What may be written to the device: everything the offline cache needs,
 * minus secret field values (gift-card numbers and PINs, Wi-Fi passwords).
 */

import { describe, expect, it } from 'vitest';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import type { ResourceDefinition } from '../../resources/types';
import {
  containsSecretValue,
  redactPersistedClient,
  redactSecrets,
  secretFieldIndex,
} from '../redactSecrets';

const DEFS = [
  {
    singular: 'gift-card',
    plural: 'gift-cards',
    fields: {
      merchant: { type: 'string' },
      card_number: { type: 'string', encrypted: true },
      pin: { type: 'string', encrypted: true },
    },
  },
  {
    singular: 'credential',
    plural: 'credentials',
    fields: { label: { type: 'string' }, value: { type: 'string', secret: { hint: 4 } } },
  },
  {
    // A harmless field that shares a name with a secret one elsewhere.
    singular: 'locker',
    plural: 'lockers',
    fields: { pin: { type: 'string' } },
  },
] as unknown as ResourceDefinition[];

const index = secretFieldIndex(DEFS);

describe('secretFieldIndex', () => {
  it('collects encrypted and secret fields by collection', () => {
    expect([...index.byCollection.get('gift-cards')!]).toEqual(['card_number', 'pin']);
    expect([...index.byCollection.get('credentials')!]).toEqual(['value']);
    expect(index.byCollection.has('lockers')).toBe(false);
    expect([...index.names].sort()).toEqual(['card_number', 'pin', 'value']);
  });
});

describe('redactSecrets', () => {
  it("removes a record's own secret fields, found by its path", () => {
    expect(
      redactSecrets(
        [{ id: 'a', path: 'gift-cards/a', merchant: 'Acme', card_number: '4111', pin: '12' }],
        index,
      ),
    ).toEqual([{ id: 'a', path: 'gift-cards/a', merchant: 'Acme' }]);
  });

  it('leaves another resource’s same-named field alone', () => {
    const locker = { id: 'l', path: 'lockers/l', pin: '0420' };
    expect(redactSecrets(locker, index)).toEqual(locker);
  });

  it('removes every secret name from an object with no path', () => {
    expect(redactSecrets({ draft: { merchant: 'Acme', card_number: '4111' } }, index)).toEqual({
      draft: { merchant: 'Acme' },
    });
  });

  it('finds records nested in pages and child paths', () => {
    expect(
      redactSecrets({ results: [{ path: 'users/u/gift-cards/a', card_number: '4111' }] }, index),
    ).toEqual({ results: [{ path: 'users/u/gift-cards/a' }] });
  });

  it('copies rather than mutating the cache', () => {
    const record = { path: 'gift-cards/a', card_number: '4111' };
    redactSecrets(record, index);
    expect(record.card_number).toBe('4111');
  });

  it('is a no-op when nothing is secret', () => {
    const value = { card_number: '4111' };
    expect(redactSecrets(value, secretFieldIndex([]))).toBe(value);
  });
});

describe('containsSecretValue', () => {
  it('finds a secret with a value anywhere', () => {
    expect(containsSecretValue({ id: 'a', data: { pin: '12' } }, index)).toBe(true);
  });

  it('ignores an empty or absent one', () => {
    expect(containsSecretValue({ id: 'a', data: { merchant: 'Acme', pin: '' } }, index)).toBe(false);
    expect(containsSecretValue('a', index)).toBe(false);
  });
});

describe('redactPersistedClient', () => {
  const client = {
    buster: 'b',
    timestamp: 1,
    clientState: {
      queries: [
        {
          queryKey: ['app', 'gift-cards', 'gift-card', 'list'],
          queryHash: 'h',
          state: { data: [{ path: 'gift-cards/a', merchant: 'Acme', card_number: '4111' }] },
        },
      ],
      mutations: [
        {
          // Its own input is a secret: kept in memory only.
          mutationKey: ['app', 'gift-cards', 'update-gift-card'],
          state: { status: 'pending', isPaused: true, variables: { id: 'a', data: { pin: '12' } } },
        },
        {
          // Harmless input, but its rollback snapshot holds the list.
          mutationKey: ['app', 'gift-cards', 'update-gift-card'],
          state: {
            status: 'pending',
            isPaused: true,
            variables: { id: 'a', data: { merchant: 'Acme Co' } },
            context: { previous: [{ path: 'gift-cards/a', card_number: '4111' }] },
          },
        },
      ],
    },
  } as unknown as PersistedClient;

  const out = redactPersistedClient(client, index);

  it('redacts cached reads', () => {
    expect(out.clientState.queries[0]!.state.data).toEqual([{ path: 'gift-cards/a', merchant: 'Acme' }]);
  });

  it('keeps a queued write whose input carries a secret off the disk', () => {
    expect(out.clientState.mutations).toHaveLength(1);
    expect(out.clientState.mutations[0]!.state.variables).toEqual({ id: 'a', data: { merchant: 'Acme Co' } });
  });

  it("redacts what a queued write remembers for rollback", () => {
    expect(out.clientState.mutations[0]!.state.context).toEqual({ previous: [{ path: 'gift-cards/a' }] });
  });

  it('leaves nothing secret in the serialized snapshot', () => {
    const json = JSON.stringify(out);
    expect(json).not.toContain('4111');
    expect(json).not.toMatch(/"pin":"12"/);
  });
});
