/**
 * Conditional updates: `If-Match` names the version (the record's
 * `update_time`) an edit was made against, and a record that has changed since
 * refuses it with 412 — so a client can keep both texts instead of silently
 * overwriting someone else's edit.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { nextVersion, versionMatches } from '../../src/engine/crud';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';

let t: TestEngine;

beforeEach(async () => {
  t = await makeEngine();
  await defineResource(t, {
    singular: 'jotting',
    plural: 'jottings',
    user_settable_create: true,
    schema: { type: 'object', properties: { body: { type: 'string' } } },
  });
});

async function create(): Promise<{ id: string; update_time: string }> {
  const res = await call(t.engine, 'POST', '/jottings', { token: t.adminToken, body: { body: 'v1' } });
  return res.json();
}

function patch(id: string, body: string, ifMatch?: string): Promise<Response> {
  return call(t.engine, 'PATCH', `/jottings/${id}`, {
    token: t.adminToken,
    contentType: 'application/merge-patch+json',
    body: { body },
    ...(ifMatch ? { headers: { 'If-Match': ifMatch } } : {}),
  });
}

describe('If-Match on update', () => {
  test('applies an edit made against the current version', async () => {
    const rec = await create();
    const res = await patch(rec.id, 'v2', `"${rec.update_time}"`);
    expect(res.status).toBe(200);
    expect((await res.json()).body).toBe('v2');
  });

  test('refuses an edit made against an older version, leaving the record alone', async () => {
    const rec = await create();
    const res = await patch(rec.id, 'v2', '"2000-01-01T00:00:00Z"');
    expect(res.status).toBe(412);
    const now = await call(t.engine, 'GET', `/jottings/${rec.id}`, { token: t.adminToken });
    expect((await now.json()).body).toBe('v1');
  });

  test('every change moves the version, even within one second', async () => {
    const rec = await create();
    const first = await patch(rec.id, 'from phone', `"${rec.update_time}"`);
    expect(first.status).toBe(200);
    expect((await first.json()).update_time > rec.update_time).toBe(true);
    // A second device's edit against the version both started from.
    expect((await patch(rec.id, 'from laptop', `"${rec.update_time}"`)).status).toBe(412);
  });

  test('updates unconditionally without the header', async () => {
    const rec = await create();
    expect((await patch(rec.id, 'v2')).status).toBe(200);
  });
});

describe('versionMatches', () => {
  test('accepts quoted, weak, bare and wildcard tags', () => {
    const v = '2026-11-07T10:00:00Z';
    expect(versionMatches(`"${v}"`, v)).toBe(true);
    expect(versionMatches(`W/"${v}"`, v)).toBe(true);
    expect(versionMatches(v, v)).toBe(true);
    expect(versionMatches('*', v)).toBe(true);
    expect(versionMatches('"a", "b"', v)).toBe(false);
  });
});

describe('nextVersion', () => {
  test('is now when time has moved on, else a second past the last version', () => {
    expect(nextVersion('2026-11-07T10:00:00Z', '2026-11-07T10:00:05Z')).toBe('2026-11-07T10:00:05Z');
    expect(nextVersion('2026-11-07T10:00:05Z', '2026-11-07T10:00:05Z')).toBe('2026-11-07T10:00:06Z');
    expect(nextVersion('2026-11-07T10:00:09Z', '2026-11-07T10:00:05Z')).toBe('2026-11-07T10:00:10Z');
  });
});
