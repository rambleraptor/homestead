/**
 * Tests for the chat semantic-search tool: auto-registration gating, and the
 * access filter that stops the (unscoped) vector index from surfacing records
 * the caller can't read.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFakeServerClient } from '../../__tests__/fake-server-client';

// Paths are relative to THIS test file (in __tests__/), and must resolve to the
// same modules search-tool.ts imports. aiEmbed would hit the network; the
// homestead-client would hit the engine — mock both.
vi.mock('../../ai/generate', async (importActual) => ({
  ...(await importActual<typeof import('../../ai/generate')>()),
  aiEmbed: vi.fn(async () => [[1, 0, 0]]),
}));

const fake = createFakeServerClient();
vi.mock('../../client', () => ({
  serverClient: () => fake.client,
}));

/** Configure the record lookups by their resolved `/plural/id` path. */
const getFn = fake.getFn;

import { setEmbeddingConfig } from '../../ai/config';
import { setVectorStore } from '../../vectors/store';
import type { VectorHit, VectorStore } from '../../vectors/types';
import { makeSearchTool } from '../search-tool';
import type { ResourceDefinition } from '../../../resources/types';

const DOC_DEF: ResourceDefinition = {
  singular: 'document',
  plural: 'documents',
  fields: { file: { type: 'file', ai: { embed: true } } },
};
const TODO_DEF: ResourceDefinition = {
  singular: 'todo',
  plural: 'todos',
  fields: { title: { type: 'string' } },
};

function fakeStore(hits: VectorHit[]): VectorStore {
  return {
    replace: vi.fn(),
    purge: vi.fn(),
    search: vi.fn(async () => hits),
  };
}

function hit(record: string, chunk: number, text: string, score: number): VectorHit {
  return { resource: 'document', record, field: 'file', chunk, text, score };
}

afterEach(() => {
  setVectorStore(null);
  setEmbeddingConfig(null);
  vi.clearAllMocks();
});

describe('makeSearchTool — gating', () => {
  it('is null when no resource embeds a file field', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'k' } });
    setVectorStore(fakeStore([]));
    expect(makeSearchTool({ defs: [TODO_DEF], token: 't' })).toBeNull();
  });

  it('is null when embedding is unconfigured, even with an embedded resource', () => {
    setVectorStore(fakeStore([]));
    expect(makeSearchTool({ defs: [DOC_DEF], token: 't' })).toBeNull();
  });

  it('is null when the vector store is not wired', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'k' } });
    expect(makeSearchTool({ defs: [DOC_DEF], token: 't' })).toBeNull();
  });

  it('is a tool when embedded resource + embedding + store are all present', () => {
    setEmbeddingConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'k' } });
    setVectorStore(fakeStore([]));
    expect(makeSearchTool({ defs: [DOC_DEF], token: 't' })).not.toBeNull();
  });
});

describe('makeSearchTool — execute', () => {
  type ExecuteFn = (args: { query: string }, opts: never) => Promise<unknown>;

  function toolFor(hits: VectorHit[]) {
    setEmbeddingConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'k' } });
    setVectorStore(fakeStore(hits));
    const t = makeSearchTool({ defs: [DOC_DEF, TODO_DEF], token: 't' })!;
    return { execute: t.execute as unknown as ExecuteFn };
  }

  it('returns accessible passages with plural-resource citations', async () => {
    getFn.mockResolvedValue({ title: 'Tax Return' });
    const { execute } = toolFor([hit('d1', 0, 'adjusted gross income', 0.9)]);

    const out = (await execute({ query: 'income' }, {} as never)) as {
      results: Array<Record<string, unknown>>;
    };
    expect(out.results).toEqual([
      {
        resource: 'documents',
        id: 'd1',
        field: 'file',
        title: 'Tax Return',
        passage: 'adjusted gross income',
        score: 0.9,
      },
    ]);
  });

  it('drops hits for records the caller cannot read', async () => {
    // d1 accessible, d2 forbidden (the record fetch throws).
    getFn.mockImplementation(async (path: string) => {
      if (path.endsWith('/d2')) throw new Error('403');
      return { title: 'Visible' };
    });
    const { execute } = toolFor([
      hit('d2', 0, 'secret passage', 0.99),
      hit('d1', 0, 'visible passage', 0.5),
    ]);

    const out = (await execute({ query: 'x' }, {} as never)) as {
      results: Array<{ id: string; passage: string }>;
    };
    expect(out.results.map((r) => r.id)).toEqual(['d1']);
    expect(out.results[0].passage).toBe('visible passage');
  });

  it("resolves a hit record's references to their target labels", async () => {
    const docWithRef: ResourceDefinition = {
      singular: 'document',
      plural: 'documents',
      fields: {
        file: { type: 'file', ai: { embed: true } },
        created_by: { type: 'string', reference: { resource: 'user' } },
      },
    };
    setEmbeddingConfig({ provider: 'openai', model: 'm', auth: { apiKey: 'k' } });
    setVectorStore(fakeStore([hit('d1', 0, 'passage', 0.9)]));
    getFn.mockImplementation(async (path: string) => {
      if (path === '/documents/d1') return { title: 'W-2', created_by: 'u-7' };
      if (path === '/users/u-7') return { display_name: 'Alice' };
      throw new Error('404');
    });
    const t = makeSearchTool({ defs: [docWithRef], token: 't' })!;

    const out = (await (t.execute as unknown as (a: { query: string }, o: never) => Promise<unknown>)(
      { query: 'x' },
      {} as never,
    )) as { results: Array<{ references?: unknown }> };

    expect(out.results[0].references).toEqual([
      { field: 'created_by', resource: 'user', id: 'u-7', label: 'Alice' },
    ]);
  });

  it('verifies access once per record even across multiple chunks', async () => {
    getFn.mockResolvedValue({ title: 'Doc' });
    const { execute } = toolFor([
      hit('d1', 0, 'chunk a', 0.9),
      hit('d1', 1, 'chunk b', 0.8),
    ]);

    const out = (await execute({ query: 'x' }, {} as never)) as { results: unknown[] };
    expect(out.results).toHaveLength(2);
    expect(getFn).toHaveBeenCalledTimes(1);
  });
});
