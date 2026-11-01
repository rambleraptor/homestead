/**
 * `include` on the VM tier, through the real People app: a read brings the
 * records it links to along — a person's households, a household's members —
 * over the API, and in one assistant tool call for "Jake's address".
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';

interface Linked {
  id: string;
  name: string;
  line1?: string;
  $included?: Record<string, { results: Linked[]; more: boolean } | Linked | null>;
}

describe('include', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
    const member = e2eClient(h.member.token);
    const jake = await member.collection<{ id: string }>('people').create({ name: 'Jake Miller' });
    const sam = await member.collection<{ id: string }>('people').create({ name: 'Sam Jones' });
    // Members as the People UI stores them (bare ids) and as paths.
    await member
      .collection('households')
      .create({ name: 'Millers', line1: '12 Oak St', city: 'Springfield', members: [jake.id] });
    await member
      .collection('households')
      .create({ name: 'Lake house', line1: '1 Shore Rd', members: [`people/${jake.id}`, sam.id] });
  });

  afterEach(async () => {
    await h.close();
  });

  test('a person’s households come back beside them, in one read', async () => {
    const [jake] = await e2eClient(h.member.token)
      .collection<Linked>('people')
      .listAll({ filter: 'name.contains("jake")', include: ['households'] });
    const households = jake!.$included!.households as { results: Linked[]; more: boolean };
    expect(households.results.map((x) => x.line1).sort()).toEqual(['1 Shore Rd', '12 Oak St']);
    expect(households.more).toBe(false);
  });

  test('a household’s members, from the other side of the same link', async () => {
    const [lake] = await e2eClient(h.member.token)
      .collection<Linked>('households')
      .listAll({ filter: 'name == "Lake house"', include: ['members'] });
    const members = lake!.$included!.members as { results: Linked[] };
    expect(members.results.map((p) => p.name).sort()).toEqual(['Jake Miller', 'Sam Jones']);
  });

  test('the assistant answers "Jake’s address" with one call', async () => {
    await h.loginAs(h.member);
    const chat = new ChatPage(h.driver);
    await chat.goto();
    await chat.send(`What's Jake's address? ${CHAT_MARKERS.jakesAddress}`);
    await h.driver.expect(chat.messages).toContainText('12 Oak St');
    await h.driver.expect(chat.messages).toContainText('1 Shore Rd');
    await h.driver.expect(chat.toolCalls).toHaveCount(1);
    await h.driver.expect(chat.toolCalls.first()).toContainText('Completed');
  });
});
