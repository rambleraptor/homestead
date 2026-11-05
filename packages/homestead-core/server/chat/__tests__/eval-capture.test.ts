/**
 * What a rated reply's eval case keeps (`../eval-capture`): the conversation up
 * to the reply, with encrypted values masked wherever they appear.
 */

import { describe, expect, it } from 'vitest';
import type { ResourceDefinition } from '../../../resources/types';
import type { StoredChatMessage } from '../../../chat/types';
import { buildTranscript, encryptedFieldNames, MASKED, messagesUpTo } from '../eval-capture';

const giftCard: ResourceDefinition = {
  singular: 'gift-card',
  plural: 'gift-cards',
  fields: {
    merchant: { type: 'string' },
    card_number: { type: 'string', encrypted: true },
    pin: { type: 'string', encrypted: true },
    api_key: { type: 'string', secret: true },
  },
};

const msg = (seq: number, role: 'user' | 'assistant', extra: Partial<StoredChatMessage> = {}): StoredChatMessage => ({
  id: `m${seq}`,
  seq,
  role,
  ...extra,
});

describe('encryptedFieldNames', () => {
  it('names encrypted fields, but not secret ones (they never read back as values)', () => {
    expect([...encryptedFieldNames([giftCard])].sort()).toEqual(['card_number', 'pin']);
  });
});

describe('messagesUpTo', () => {
  it('keeps the messages through the rated one, in order', () => {
    const all = [msg(3, 'user'), msg(1, 'user'), msg(4, 'assistant'), msg(2, 'assistant')];
    expect(messagesUpTo(all, 'm2')?.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('is null for a message that isn’t there', () => {
    expect(messagesUpTo([msg(1, 'user')], 'nope')).toBeNull();
  });
});

describe('buildTranscript', () => {
  const names = encryptedFieldNames([giftCard]);

  it('masks encrypted fields in tool inputs and outputs, and their values anywhere else', () => {
    const { transcript } = buildTranscript(
      [
        msg(1, 'user', { content: 'What is my Bookshop card?' }),
        msg(2, 'assistant', {
          content: 'Your Bookshop card is 4111-2222.',
          parts: [
            {
              type: 'tool-gift_cards',
              toolCallId: 't1',
              state: 'output-available',
              input: { action: 'list' },
              output: { results: [{ merchant: 'Bookshop', card_number: '4111-2222', pin: '9876' }] },
            },
            { type: 'text', text: 'Your Bookshop card is 4111-2222.' },
          ] as StoredChatMessage['parts'],
        }),
        msg(3, 'user', { content: 'Thanks, the pin is 9876 right?' }),
      ],
      names,
    );
    const text = JSON.stringify(transcript);
    expect(text).not.toContain('4111-2222');
    expect(text).not.toContain('9876');
    expect(text).toContain('Bookshop');
    expect(transcript[1].content).toBe(`Your Bookshop card is ${MASKED}.`);
    expect(transcript[2].content).toBe(`Thanks, the pin is ${MASKED} right?`);
  });

  it('leaves very short values alone in free text', () => {
    const { transcript } = buildTranscript(
      [
        msg(1, 'assistant', {
          content: 'Pin 12 is set.',
          parts: [{ type: 'tool-gift_cards', output: { pin: '12' } }] as unknown as StoredChatMessage['parts'],
        }),
      ],
      names,
    );
    expect(transcript[0].content).toBe('Pin 12 is set.');
    expect(JSON.stringify(transcript[0].parts)).toContain(MASKED);
  });

  it('notes a shortened tool output, and describes attachments without copying them', () => {
    const { transcript, truncated } = buildTranscript(
      [
        msg(1, 'user', {
          attachments: [{ id: 'f1', url: '/x', name: 'receipt.png', media_type: 'image/png', size: 10 }] as StoredChatMessage['attachments'],
        }),
        msg(2, 'assistant', {
          parts: [{ type: 'tool-groceries', output: { truncated: true, size: 9000, preview: '[' } }] as unknown as StoredChatMessage['parts'],
        }),
      ],
      names,
    );
    expect(truncated).toBe(true);
    expect(transcript[0].attachments).toEqual([{ name: 'receipt.png', media_type: 'image/png', size: 10 }]);
  });

  it('is not truncated when every output was kept whole', () => {
    expect(buildTranscript([msg(1, 'assistant', { content: 'Hi' })], names).truncated).toBe(false);
  });
});
