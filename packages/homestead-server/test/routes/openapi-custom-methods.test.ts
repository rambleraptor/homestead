/**
 * Unit tests for injectCustomMethods — the server-layer enrichment that adds
 * app-declared AEP-136 custom methods to the engine's OpenAPI doc as
 * first-class `:verb` paths.
 */

import { describe, expect, test } from 'vitest';
import type { ResourceCustomMethod } from '@rambleraptor/homestead-core/resources/types';
import { injectCustomMethods } from '../../src/routes/openapi-custom-methods';
import { uploadSchema } from '@rambleraptor/homestead-core/resources/custom-methods/schema';

// A resource path set shaped like the engine emits: a top-level collection
// (groceries) and a user-parented resource with collection + item paths.
function baseDoc() {
  return {
    openapi: '3.1.0',
    paths: {
      '/groceries': { get: {}, post: {} },
      '/groceries/{grocery_id}': { get: {} },
      '/users/{user_id}/notification-subscriptions': { get: {}, post: {} },
      '/users/{user_id}/notification-subscriptions/{notification_subscription_id}':
        { get: {}, patch: {}, delete: {} },
    },
    components: { schemas: {} },
  };
}

// Minimal ResourceCustomMethod — `load` is never called by the injector.
function method(m: Partial<ResourceCustomMethod>): ResourceCustomMethod {
  return { load: async () => ({ default: async () => new Response() }), ...m };
}

describe('injectCustomMethods', () => {
  test('adds an item-target method with reconstructed path params', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'notification-subscriptions:send-notification': method({
        target: 'item',
        description: 'Send to this device.',
        request: { type: 'object', properties: { title: { type: 'string' } } },
        response: { type: 'object', properties: { sent: { type: 'integer' } } },
      }),
    });

    const key =
      '/users/{user_id}/notification-subscriptions/{notification_subscription_id}:send-notification';
    const op = (doc.paths as Record<string, any>)[key]?.post;
    expect(op).toBeDefined();
    // AEP style: the verb, then the singular an item method acts on.
    expect(op.operationId).toBe('SendNotificationNotificationSubscription');
    expect(op.description).toBe('Send to this device.');
    // Both path params reconstructed from the template, in order, required.
    expect(op.parameters.map((p: any) => p.name)).toEqual([
      'user_id',
      'notification_subscription_id',
    ]);
    expect(op.parameters.every((p: any) => p.in === 'path' && p.required)).toBe(
      true,
    );
    expect(op.requestBody.content['application/json'].schema).toEqual({
      type: 'object',
      properties: { title: { type: 'string' } },
    });
    expect(op.responses['200'].content['application/json'].schema).toEqual({
      type: 'object',
      properties: { sent: { type: 'integer' } },
    });
  });

  test('collection-target method attaches to the collection path with no path params', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:send-notification': method({ target: 'collection' }),
    });

    const op = (doc.paths as Record<string, any>)['/groceries:send-notification']
      ?.post;
    expect(op).toBeDefined();
    expect(op.parameters).toEqual([]);
    // No declared schema → an optional empty-object body (AEP-136 POSTs take
    // one), generic 200.
    expect(op.requestBody).toEqual({
      required: false,
      content: { 'application/json': { schema: { type: 'object' } } },
    });
    expect(op.responses['200'].content['application/json'].schema).toEqual({
      type: 'object',
    });
  });

  test('async method emits 202 + x-aep-long-running-operation', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:parse': method({
        target: 'collection',
        async: true,
        response: { type: 'object', properties: { ok: { type: 'boolean' } } },
      }),
    });

    const op = (doc.paths as Record<string, any>)['/groceries:parse']?.post;
    expect(op.responses['202']).toBeDefined();
    expect(op.responses['200']).toBeUndefined();
    expect(op['x-aep-long-running-operation'].response.schema).toEqual({
      type: 'object',
      properties: { ok: { type: 'boolean' } },
    });
  });

  test('respects a non-POST http method', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:export': method({ target: 'collection', method: 'GET' }),
    });
    const path = (doc.paths as Record<string, any>)['/groceries:export'];
    expect(path.get).toBeDefined();
    expect(path.post).toBeUndefined();
  });

  test('skips a method whose resource is absent from the doc (no throw)', () => {
    const doc = baseDoc();
    expect(() =>
      injectCustomMethods(doc, {
        'nonexistent:frob': method({ target: 'collection' }),
      }),
    ).not.toThrow();
    expect(
      (doc.paths as Record<string, any>)['/nonexistent:frob'],
    ).toBeUndefined();
  });

  test('names a collection method by verb and plural', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, { 'groceries:bulk-import': method({ target: 'collection' }) });
    expect((doc.paths as Record<string, any>)['/groceries:bulk-import'].post.operationId).toBe(
      'BulkImportGroceries',
    );
  });

  test('declares the standard problem errors', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:frob': method({ target: 'collection', request: { type: 'object', properties: {} } }),
      'groceries:poke': method({ target: 'item' }),
    });
    const frob = (doc.paths as Record<string, any>)['/groceries:frob'].post.responses;
    expect(Object.keys(frob).sort()).toEqual(['200', '400', '401', '403', 'default']);
    const problem = frob['400'].content['application/json'];
    expect(problem.schema.required).toEqual(['type', 'title', 'status', 'detail', 'error']);
    expect(problem.example).toMatchObject({ title: 'Bad Request', status: 400 });
    // An item method can miss its record; one with no input has nothing to be invalid.
    const poke = (doc.paths as Record<string, any>)['/groceries/{grocery_id}:poke'].post.responses;
    expect(Object.keys(poke).sort()).toEqual(['200', '401', '403', '404', 'default']);
  });

  test('offers multipart, with a JSON body part, only when the request takes files', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:process-image': method({
        request: { type: 'object', properties: { image: uploadSchema() }, required: ['image'] },
      }),
      'groceries:rename': method({
        request: { type: 'object', properties: { name: { type: 'string' } } },
      }),
    });
    const paths = doc.paths as Record<string, any>;
    const upload = paths['/groceries:process-image'].post.requestBody;
    expect(upload.required).toBe(true);
    expect(Object.keys(upload.content).sort()).toEqual(['application/json', 'multipart/form-data']);
    const multipart = upload.content['multipart/form-data'];
    expect(multipart.schema.required).toEqual(['body']);
    expect(multipart.encoding.body.contentType).toBe('application/json');

    const plain = paths['/groceries:rename'].post.requestBody;
    expect(plain.required).toBe(false);
    expect(Object.keys(plain.content)).toEqual(['application/json']);
  });

  test("refers an async method's 202 to the operation schema", () => {
    const doc = baseDoc();
    (doc.components.schemas as Record<string, unknown>).operation = { type: 'object' };
    injectCustomMethods(doc, { 'groceries:slow': method({ async: true }) });
    const res = (doc.paths as Record<string, any>)['/groceries:slow'].post.responses['202'];
    expect(res.content['application/json'].schema).toEqual({ $ref: '#/components/schemas/operation' });
  });

  test('emits query parameters and non-JSON response types', () => {
    const doc = baseDoc();
    injectCustomMethods(doc, {
      'groceries:bulk-export': method({
        method: 'GET',
        query: { format: { schema: { type: 'string', enum: ['csv'] }, description: 'Format.' } },
        responseMediaTypes: ['text/csv'],
      }),
    });
    const op = (doc.paths as Record<string, any>)['/groceries:bulk-export'].get;
    expect(op.parameters).toEqual([
      { in: 'query', name: 'format', required: false, schema: { type: 'string', enum: ['csv'] }, description: 'Format.' },
    ]);
    expect(op.responses['200'].content['text/csv'].schema).toEqual({ type: 'string', format: 'binary' });
  });
});
