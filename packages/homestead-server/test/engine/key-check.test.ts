/**
 * Which encrypted fields an instance can't write without a master key — what
 * the boot-time schema sync warns about and `homestead doctor` reports.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { randomBytes } from 'node:crypto';
import { defineResource, makeEngine, type TestEngine } from './helpers';
import { __resetMasterKeyCacheForTests } from '../../src/engine/crypto';
import {
  declaredEncryptedFields,
  fieldsNeedingMasterKey,
  missingMasterKeyWarning,
} from '../../src/engine/key-check';

let t: TestEngine;

function useKey(on: boolean): void {
  if (on) process.env.HOMESTEAD_MASTER_KEY = randomBytes(32).toString('base64');
  else delete process.env.HOMESTEAD_MASTER_KEY;
  __resetMasterKeyCacheForTests();
}

beforeEach(async () => {
  useKey(false);
  t = await makeEngine();
  await defineResource(
    t,
    {
      singular: 'gift-card',
      plural: 'gift-cards',
      schema: {
        type: 'object',
        properties: {
          merchant: { type: 'string' },
          card_number: { type: 'string', 'x-aepbase-encrypted': true },
          pin: { type: 'string', 'x-aepbase-encrypted': true },
        },
      },
    },
    'gift-card',
  );
  await defineResource(
    t,
    {
      singular: 'credential',
      plural: 'credentials',
      schema: { type: 'object', properties: { api_key: { type: 'string', 'x-aepbase-secret': true } } },
    },
    'credential',
  );
  await defineResource(
    t,
    { singular: 'note', plural: 'notes', schema: { type: 'object', properties: { body: { type: 'string' } } } },
    'note',
  );
});

afterEach(() => useKey(false));

describe('encrypted fields and the master key', () => {
  test('lists every declared encrypted field, secrets included', () => {
    expect(declaredEncryptedFields(t.engine.db)).toEqual([
      'credential.api_key',
      'gift-card.card_number',
      'gift-card.pin',
    ]);
  });

  test('without a key they all need one, and the warning names them', () => {
    const fields = fieldsNeedingMasterKey(t.engine.db);
    expect(fields).toHaveLength(3);
    const warning = missingMasterKeyWarning(fields);
    expect(warning).toContain("3 encrypted field(s) can't be saved: credential.api_key, gift-card.card_number");
    expect(warning).toContain('homestead key generate');
  });

  test('with a key none do', () => {
    useKey(true);
    expect(fieldsNeedingMasterKey(t.engine.db)).toEqual([]);
  });
});
