/**
 * Validates the generated OpenAPI doc two ways:
 * 1. Structural invariants against a frozen baseline
 *    (test/fixtures/openapi-baseline.json) for a fixed resource set — a
 *    regression guard on the AEP wire contract: path shapes, operationIds,
 *    skip/filter parameter names, the `results` envelope. (Originally captured
 *    from the Go server this engine replaced; that server is long gone, so the
 *    file is a golden reference, not a parity target.)
 * 2. A consumer round-trip through @aep_dev/aep-lib-ts `APIClient.fromOpenAPI`
 *    plus the CLI's patchCreateMethods logic — the actual fidelity bar for
 *    `homestead resources`.
 */

import { beforeAll, describe, expect, test } from 'vitest';
import { APIClient } from '@aep_dev/aep-lib-ts';
import baseline from '../fixtures/openapi-baseline.json';
import { call, defineResource, makeEngine, type TestEngine } from './helpers';

let t: TestEngine;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let doc: any;

/** Recreate the fixed resource set the baseline covers. */
beforeAll(async () => {
  t = await makeEngine();
  await defineResource(t, {
    singular: 'gift-card',
    plural: 'gift-cards',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        card_number: { type: 'string' },
        amount: { type: 'number' },
        archived: { type: 'boolean' },
        front_image: { type: 'binary', 'x-aepbase-file-field': true },
      },
      required: ['merchant', 'card_number', 'amount'],
    },
  });
  await defineResource(t, {
    singular: 'transaction',
    plural: 'transactions',
    parents: ['gift-card'],
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: { notes: { type: 'string' }, new_amount: { type: 'number' } },
      required: ['new_amount'],
    },
  });
  await defineResource(t, {
    singular: 'notification',
    plural: 'notifications',
    parents: ['user'],
    schema: {
      type: 'object',
      properties: { title: { type: 'string' }, read: { type: 'boolean' } },
    },
  });
  await defineResource(t, {
    singular: 'profile',
    plural: 'profiles',
    parents: ['user'],
    singleton: true,
    schema: { type: 'object', properties: { bio: { type: 'string' } } },
  });

  const res = await call(t.engine, 'GET', '/openapi.json');
  expect(res.status).toBe(200); // openapi.json is auth-exempt
  doc = await res.json();
});

/**
 * Query parameters Homestead adds to the AEP contract the baseline froze —
 * `include` (linked records, `src/engine/include.ts`) — set aside when
 * comparing against it, and checked on their own below.
 */
const HOMESTEAD_EXTENSION_PARAMS = new Set(['include']);

describe('AEP wire-contract invariants vs the baseline', () => {
  test('same path set', () => {
    expect(Object.keys(doc.paths).sort()).toEqual(Object.keys(baseline.paths).sort());
  });

  test('same operations per path', () => {
    for (const [path, ops] of Object.entries(baseline.paths)) {
      expect(Object.keys(doc.paths[path]).sort()).toEqual(
        Object.keys(ops as object).sort(),
      );
    }
  });

  test('same operationIds and parameter names', () => {
    for (const [path, ops] of Object.entries(baseline.paths) as [string, Record<string, any>][]) {
      for (const [method, op] of Object.entries(ops) as [string, any][]) {
        const ours = doc.paths[path][method];
        expect(ours.operationId).toBe(op['operationId']);
        const baselineParams = ((op['parameters'] ?? []) as { name: string }[]).map((p) => p.name);
        const ourParams = ((ours.parameters ?? []) as { name: string }[])
          .map((p) => p.name)
          .filter((name) => !HOMESTEAD_EXTENSION_PARAMS.has(name));
        expect(ourParams.sort()).toEqual(baselineParams.sort());
      }
    }
  });

  test('include lists a resource’s links on get and list, and only where it has some', () => {
    const includeOf = (path: string, method: string) =>
      ((doc.paths[path][method].parameters ?? []) as { name: string; schema?: any }[]).find(
        (p) => p.name === 'include',
      );
    const offered: string[] = [];
    for (const [path, ops] of Object.entries(doc.paths) as [string, Record<string, any>][]) {
      for (const method of Object.keys(ops)) {
        const include = includeOf(path, method);
        if (!include) continue;
        offered.push(...include.schema.items.enum);
        expect(method).toBe('get');
        expect(include.schema.type).toBe('array');
        expect(include.schema.items.enum.length).toBeGreaterThan(0);
      }
    }
    // A gift card's transactions are a child collection; a transaction's gift card its parent.
    expect(offered).toEqual(expect.arrayContaining(['transactions', 'parent']));
  });

  test('same component schemas with matching x-aep-resource', () => {
    const baselineSchemas = baseline.components.schemas as unknown as Record<string, any>;
    expect(Object.keys(doc.components.schemas).sort()).toEqual(Object.keys(baselineSchemas).sort());
    for (const [name, baselineSchema] of Object.entries(baselineSchemas)) {
      const ours = doc.components.schemas[name];
      expect(ours['x-aep-resource']).toEqual(baselineSchema['x-aep-resource']);
      expect(Object.keys(ours.properties).sort()).toEqual(
        Object.keys(baselineSchema['properties']).sort(),
      );
      expect(ours.required ?? []).toEqual(baselineSchema['required'] ?? []);
    }
  });

  test('same response status codes per operation', () => {
    for (const [path, ops] of Object.entries(baseline.paths) as [string, Record<string, any>][]) {
      for (const [method, op] of Object.entries(ops) as [string, any][]) {
        expect(Object.keys(doc.paths[path][method].responses).sort()).toEqual(
          Object.keys(op['responses']).sort(),
        );
      }
    }
  });

  test('file fields carry x-aepbase-file-field', () => {
    const prop = doc.components.schemas['gift-card'].properties['front_image'];
    expect(prop['x-aepbase-file-field']).toBe(true);
    expect(prop['type']).toBe('binary');
  });
});

describe('resource references in the generated doc', () => {
  test('emits x-aep-resource-reference and drops the internal marker', async () => {
    // A fresh engine so the frozen-baseline resource set above is untouched.
    const t2 = await makeEngine();
    await defineResource(t2, {
      singular: 'store',
      plural: 'stores',
      user_settable_create: true,
      schema: { type: 'object', properties: { name: { type: 'string' } } },
    });
    await defineResource(t2, {
      singular: 'grocery',
      plural: 'groceries',
      user_settable_create: true,
      schema: {
        type: 'object',
        properties: {
          store: {
            type: 'string',
            'x-aepbase-reference': { resource: 'store', onDelete: 'restrict' },
          },
          buddies: {
            type: 'array',
            items: { type: 'string', 'x-aepbase-reference': { resource: 'store' } },
          },
        },
      },
    });

    const doc2 = await (await call(t2.engine, 'GET', '/openapi.json')).json();
    const props = doc2.components.schemas['grocery'].properties;

    expect(props.store['x-aep-resource-reference']).toEqual({
      type: 'aepbase/store',
      onDelete: 'restrict',
    });
    expect(props.store['x-aepbase-reference']).toBeUndefined();
    // To-many references are annotated on the array's items.
    expect(props.buddies.items['x-aep-resource-reference']).toEqual({ type: 'aepbase/store' });
    expect(props.buddies.items['x-aepbase-reference']).toBeUndefined();
  });
});

describe('aep-lib-ts consumer round-trip', () => {
  test('fromOpenAPI + patchCreateMethods derives the full resource model', async () => {
    const apiClient = await APIClient.fromOpenAPI(doc, 'http://localhost:8090');
    const resources = apiClient.resources();

    // The CLI's patchCreateMethods compensation (create declares 201).
    for (const resource of Object.values(resources)) {
      const r = resource as {
        createMethod?: { supportsUserSettableCreate: boolean };
        patternElems: string[];
      };
      if (r.createMethod) continue;
      const collectionPath = `/${r.patternElems.slice(0, -1).join('/')}`;
      const post = doc.paths[collectionPath]?.['post'] as
        | { parameters?: { name: string }[] }
        | undefined;
      if (!post) continue;
      r.createMethod = {
        supportsUserSettableCreate: post.parameters?.some((p) => p.name === 'id') ?? false,
      };
    }

    // Fidelity bar: the same resource set aep-lib-ts derives from the baseline.
    // (Singletons like `profile` are invisible to fromOpenAPI for both —
    // their GET response isn't a list envelope — so neither doc surfaces it.)
    const baselineClient = await APIClient.fromOpenAPI(
      baseline as never,
      'http://localhost:8090',
    );
    expect(Object.keys(resources).sort()).toEqual(Object.keys(baselineClient.resources()).sort());

    const giftCard = resources['gift-card'] as {
      plural: string;
      patternElems: string[];
      getMethod?: object;
      listMethod?: { supportsFilter: boolean; supportsSkip: boolean };
      updateMethod?: object;
      deleteMethod?: object;
      createMethod?: { supportsUserSettableCreate: boolean };
    };
    expect(giftCard.plural).toBe('gift-cards');
    expect(giftCard.patternElems).toEqual(['gift-cards', '{gift_card_id}']);
    expect(giftCard.getMethod).toBeDefined();
    expect(giftCard.updateMethod).toBeDefined();
    expect(giftCard.deleteMethod).toBeDefined();
    expect(giftCard.listMethod?.supportsFilter).toBe(true);
    expect(giftCard.listMethod?.supportsSkip).toBe(true);
    expect(giftCard.createMethod?.supportsUserSettableCreate).toBe(true);

    const notification = resources['notification'] as typeof giftCard & {
      parents: { singular: string }[];
    };
    expect(notification.patternElems).toEqual([
      'users',
      '{user_id}',
      'notifications',
      '{notification_id}',
    ]);
    expect(notification.createMethod?.supportsUserSettableCreate).toBe(false);
  });
});

describe('files below the top level in the generated doc', () => {
  test('read as descriptors, and :download takes a file id', async () => {
    // A fresh engine so the frozen-baseline resource set above is untouched.
    const t2 = await makeEngine();
    await defineResource(t2, {
      singular: 'scrapbook',
      plural: 'scrapbooks',
      user_settable_create: true,
      schema: {
        type: 'object',
        properties: {
          cover: { type: 'binary', 'x-aepbase-file-field': true },
          attachments: { type: 'array', items: { type: 'binary', 'x-aepbase-file-field': true } },
          profile: {
            type: 'object',
            properties: { avatar: { type: 'binary', 'x-aepbase-file-field': true } },
          },
        },
      },
    });
    const doc2 = await (await call(t2.engine, 'GET', '/openapi.json')).json();
    const props = doc2.components.schemas['scrapbook'].properties;

    // The top-level file field keeps its original shape.
    expect(props.cover).toMatchObject({ type: 'binary', 'x-aepbase-file-field': true });
    for (const file of [props.attachments.items, props.profile.properties.avatar]) {
      expect(file.type).toBe('object');
      expect(file['x-aepbase-file-field']).toBe(true);
      expect(Object.keys(file.properties)).toEqual(['id', 'url', 'name', 'media_type', 'size', 'encrypted']);
    }

    const body =
      doc2.paths['/scrapbooks/{scrapbook_id}:download'].post.requestBody.content['application/json'].schema;
    expect(Object.keys(body.properties)).toEqual(['field', 'file']);
    expect(body.required).toBeUndefined();

    // aep-lib-ts still derives the resource.
    const client = await APIClient.fromOpenAPI(doc2, 'http://localhost:8090');
    expect(Object.keys(client.resources())).toContain('scrapbook');
  });
});
