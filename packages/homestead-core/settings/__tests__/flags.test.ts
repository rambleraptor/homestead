import { describe, expect, it } from 'vitest';
import {
  audienceFieldName,
  buildResourceSchema,
  decodeAudience,
  encodeAudience,
  fieldName,
  inAudience,
  parseFieldName,
  unflatten,
  unflattenAudiences,
  withDefaults,
  type AppFlagDefs,
} from '../flags';

const defs: AppFlagDefs = {
  'gift-cards': {
    show_archived: {
      type: 'boolean',
      label: 'Show archived',
      description: 'Show archived gift cards.',
      default: false,
    },
  },
  settings: {
    theme: {
      type: 'enum',
      label: 'Theme',
      description: 'Color theme for the app.',
      options: ['light', 'dark'],
      default: 'light',
    },
  },
  groceries: {
    refill_threshold: {
      type: 'number',
      label: 'Refill threshold',
      description: 'How many items trigger a refill reminder.',
      default: 3,
    },
  },
};

describe('fieldName / parseFieldName', () => {
  it('flattens a kebab-case app id to snake_case with a double-underscore separator', () => {
    expect(fieldName('gift-cards', 'show_archived')).toBe(
      'gift_cards__show_archived',
    );
  });

  it('round-trips to the original app id and key', () => {
    expect(parseFieldName('gift_cards__show_archived')).toEqual({
      appId: 'gift-cards',
      key: 'show_archived',
    });
  });

  it('returns null when the separator is missing', () => {
    expect(parseFieldName('id')).toBeNull();
    expect(parseFieldName('create_time')).toBeNull();
  });
});

describe('unflatten', () => {
  it('parses aepbase flat fields back into the nested tree', () => {
    const nested = unflatten(
      {
        id: 'abc',
        create_time: '2024-01-01',
        gift_cards__show_archived: true,
        settings__theme: 'dark',
        groceries__refill_threshold: 5,
      },
      defs,
    );
    expect(nested).toEqual({
      'gift-cards': { show_archived: true },
      settings: { theme: 'dark' },
      groceries: { refill_threshold: 5 },
    });
  });

  it('drops values that are not in the allowed enum options', () => {
    const nested = unflatten(
      { settings__theme: 'rainbow' },
      defs,
    );
    // Falls back to the declared default instead of the invalid value.
    expect(nested.settings.theme).toBe('light');
  });

  it('merges defaults for unset keys', () => {
    const nested = unflatten({}, defs);
    expect(nested).toEqual({
      'gift-cards': { show_archived: false },
      settings: { theme: 'light' },
      groceries: { refill_threshold: 3 },
    });
  });

  it('handles a null record gracefully', () => {
    expect(unflatten(null, defs).settings.theme).toBe('light');
  });
});

describe('withDefaults', () => {
  it('leaves existing values alone and fills in defaults only where missing', () => {
    const merged = withDefaults(defs, {
      settings: { theme: 'dark' },
    });
    expect(merged.settings.theme).toBe('dark');
    expect(merged['gift-cards'].show_archived).toBe(false);
  });
});

describe('buildResourceSchema', () => {
  it('produces one alphabetically-sorted property per declared flag, each with its audience', () => {
    const schema = buildResourceSchema(defs);
    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties)).toEqual([
      'gift_cards__show_archived',
      'gift_cards__show_archived__audience',
      'groceries__refill_threshold',
      'groceries__refill_threshold__audience',
      'settings__theme',
      'settings__theme__audience',
    ]);
  });

  it('maps primitive types directly and encodes enum options in the description', () => {
    const schema = buildResourceSchema(defs);
    expect(schema.properties.gift_cards__show_archived.type).toBe('boolean');
    expect(schema.properties.groceries__refill_threshold.type).toBe('number');
    expect(schema.properties.settings__theme).toEqual({
      type: 'string',
      description: expect.stringContaining('light, dark'),
    });
  });

  it('encodes declared defaults in the description so aepbase can round-trip them', () => {
    const schema = buildResourceSchema(defs);
    expect(schema.properties.settings__theme.description).toContain(
      '(default: light)',
    );
    expect(schema.properties.gift_cards__show_archived.description).toContain(
      '(default: false)',
    );
    expect(schema.properties.groceries__refill_threshold.description).toContain(
      '(default: 3)',
    );
  });
});

describe('audiences', () => {
  it('ride in a sibling field that the value readers skip', () => {
    expect(audienceFieldName('gift-cards', 'show_archived')).toBe('gift_cards__show_archived__audience');
    const record = {
      gift_cards__show_archived: true,
      gift_cards__show_archived__audience: '["Beta"]',
    };
    expect(unflatten(record, defs)['gift-cards']).toEqual({ show_archived: true });
    expect(unflattenAudiences(record, defs)['gift-cards']).toEqual({ show_archived: ['Beta'] });
    // Unset is everyone, for every declared flag.
    expect(unflattenAudiences(record, defs).settings).toEqual({ theme: 'everyone' });
  });

  it('encode as empty for everyone and a JSON list otherwise', () => {
    expect(encodeAudience('everyone')).toBe('');
    expect(encodeAudience([])).toBe('[]');
    expect(decodeAudience(encodeAudience(['Beta', 'Admins']))).toEqual(['Beta', 'Admins']);
    expect(decodeAudience('')).toBe('everyone');
    expect(decodeAudience(undefined)).toBe('everyone');
    // Anything unreadable is everyone rather than locking the flag away.
    expect(decodeAudience('not json')).toBe('everyone');
    expect(decodeAudience('{"a":1}')).toBe('everyone');
  });

  it('include a person by any of their groups, and nobody by an empty list', () => {
    expect(inAudience('everyone', [])).toBe(true);
    expect(inAudience(['Beta'], ['Members', 'Beta'])).toBe(true);
    expect(inAudience(['Beta'], ['Members'])).toBe(false);
    expect(inAudience([], ['Members'])).toBe(false);
  });

  it('get a schema property beside each flag', () => {
    const { properties } = buildResourceSchema(defs);
    expect(properties.gift_cards__show_archived__audience).toMatchObject({ type: 'string' });
    expect(Object.keys(properties)).toHaveLength(6);
  });
});
