import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ResourceDefinition } from '../../../resources/types';
import { setLinkResolver, type LinkInfo } from '../../links';
import { buildResourceTools } from '../per-resource';

const DEFS: ResourceDefinition[] = [
  { singular: 'person', plural: 'people', fields: { name: { type: 'string', required: true } } },
  {
    singular: 'household',
    plural: 'households',
    fields: {
      name: { type: 'string', required: true },
      members: { type: 'array', items: { type: 'string', reference: { resource: 'person' } } },
    },
  },
];

const LINKS: Record<string, LinkInfo[]> = {
  person: [
    { name: 'households', to: 'household', many: true },
    // Leads to a resource this surface doesn't offer: never offered as a link.
    { name: 'secret-notes', to: 'secret-note', many: true },
  ],
  household: [{ name: 'members', to: 'person', many: true }],
};

beforeEach(() => setLinkResolver((singular) => LINKS[singular] ?? []));
afterEach(() => setLinkResolver(null));

describe('include on the per-resource tools', () => {
  it('names the links a resource has, only where the surface offers what they lead to', () => {
    const { tools } = buildResourceTools(DEFS);
    expect(tools.people!.description).toContain('Links (for include): households (household, many).');
    expect(tools.people!.description).toContain('list(filter?, order_by?, limit?, include?)');
    expect(tools.people!.description).not.toContain('secret-notes');
    const shape = (tools.people!.inputSchema as z.ZodObject).shape as Record<string, z.ZodTypeAny>;
    expect(shape.include!.safeParse(['households']).success).toBe(true);
    expect(shape.include!.safeParse(['secret-notes']).success).toBe(false);
  });

  it('a resource without links has no include', () => {
    setLinkResolver(() => []);
    const { tools } = buildResourceTools(DEFS);
    expect(tools.people!.description).not.toContain('Links');
    expect((tools.people!.inputSchema as z.ZodObject).shape).not.toHaveProperty('include');
  });

  it('an unknown link is refused with the ones there are, before anything is read', async () => {
    const { execute } = buildResourceTools(DEFS);
    const out = await execute('people', { action: 'list', include: ['secret-notes'] }, 'token');
    expect(out).toEqual({ ok: false, error: 'people has no link "secret-notes" — its links: households' });
  });
});
