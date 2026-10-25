import { describe, expect, it } from 'vitest';
import type { AppConfig, ChatValueType } from '../../apps/types';
import { appValueTypes, plainReplyText, valueTypeLines, valueTypeOf } from '../values';

const render = (() => Promise.resolve(() => null)) as ChatValueType['component'];
const value = (description: string, example = 'x'): ChatValueType => ({ description, example, component: render });

const people = {
  id: 'people',
  name: 'People',
  resources: [{ singular: 'person', plural: 'people', fields: {} }],
  chat: { values: { address: value('a postal address', '12 Oak St') } },
} as unknown as AppConfig;

const rival = {
  id: 'rival',
  name: 'Rival',
  resources: [{ singular: 'place', plural: 'places', fields: {} }],
  chat: { values: { address: value('another address'), phone: value('not core'), 'Bad Name': value('x') } },
  children: [
    {
      id: 'nested',
      name: 'Nested',
      resources: [{ singular: 'spot', plural: 'spots', fields: {} }],
      chat: { values: { plate: value('a license plate') } },
    },
  ],
} as unknown as AppConfig;

describe('valueTypeOf', () => {
  it('reads the type off a homestead: link and nothing else', () => {
    expect(valueTypeOf('homestead:address')).toBe('address');
    expect(valueTypeOf('homestead:Address')).toBeNull();
    expect(valueTypeOf('homestead:')).toBeNull();
    expect(valueTypeOf('homestead:address/../x')).toBeNull();
    expect(valueTypeOf('https://example.com')).toBeNull();
    expect(valueTypeOf(undefined)).toBeNull();
  });
});

describe('plainReplyText', () => {
  it('reduces typed values to their text and leaves other links alone', () => {
    expect(
      plainReplyText('Jake: [12 Oak St](homestead:address), [docs](https://e.com)'),
    ).toBe('Jake: 12 Oak St, [docs](https://e.com)');
  });
});

describe('appValueTypes', () => {
  it('collects apps\' types in order, first declaration winning, core names reserved', () => {
    const types = appValueTypes([people, rival]);
    expect([...types.keys()]).toEqual(['address', 'plate']);
    expect(types.get('address')?.description).toBe('a postal address');
  });

  it('keeps only apps with an offered tool, like app notes', () => {
    expect([...appValueTypes([people, rival], new Set(['spot'])).keys()]).toEqual(['plate']);
    expect([...appValueTypes([people], new Set(['recipe'])).keys()]).toEqual([]);
  });
});

describe('valueTypeLines', () => {
  it('lists core types first, each with its syntax', () => {
    expect(valueTypeLines([people], new Set(['person']))).toEqual([
      '- phone: a phone number, e.g. [(555) 123-4567](homestead:phone)',
      '- email: an email address, e.g. [jake@example.com](homestead:email)',
      '- address: a postal address, e.g. [12 Oak St](homestead:address)',
    ]);
  });
});
