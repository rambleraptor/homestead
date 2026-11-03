/**
 * Unit tests for the custom-method dispatcher. Exercises the
 * parse → resolve → method-check → auth-check → load → invoke pipeline
 * (plus the aepbase passthrough fallback) with synthetic wiring so the
 * test stays isolated from the real resource registry.
 */

import { ProblemError } from '../../problem';
import { describe, it, expect, vi } from 'vitest';
import {
  dispatchCustomMethod,
  parseCustomMethodPath,
} from '../dispatcher';
import type {
  CustomMethodAuth,
  CustomMethodHandler,
  ResourceCustomMethod,
} from '../../types';

const fakeAuth: CustomMethodAuth = {
  token: 'tok',
  user: { id: 'u1', path: '/users/u1', email: 'a@b.c' },
};

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/aep/grocery-items:process-image', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function makeMethod(
  handler: CustomMethodHandler,
  overrides: Partial<ResourceCustomMethod> = {},
): ResourceCustomMethod {
  return {
    target: 'collection',
    method: 'POST',
    load: async () => ({ default: handler }),
    ...overrides,
  };
}

const neverPassthrough = vi.fn(async () =>
  Response.json({ error: 'should not passthrough' }, { status: 599 }),
);

describe('parseCustomMethodPath', () => {
  it('parses a collection method', () => {
    expect(parseCustomMethodPath('/grocery-items:process-image')).toEqual({
      plural: 'grocery-items',
      target: 'collection',
      parent: [],
      verb: 'process-image',
    });
  });

  it('parses an item method, exposing the id', () => {
    expect(parseCustomMethodPath('/hsa-receipts/abc123:parse-receipt')).toEqual({
      plural: 'hsa-receipts',
      target: 'item',
      id: 'abc123',
      parent: [],
      verb: 'parse-receipt',
    });
  });

  it('parses a nested collection method, capturing the parent chain', () => {
    expect(
      parseCustomMethodPath('/gift-cards/g1/transactions:settle'),
    ).toEqual({
      plural: 'transactions',
      target: 'collection',
      parent: ['gift-cards', 'g1'],
      verb: 'settle',
    });
  });

  it('ignores a trailing query string', () => {
    expect(
      parseCustomMethodPath('/gift-cards/g1:download?field=front_image'),
    ).toMatchObject({ plural: 'gift-cards', target: 'item', verb: 'download' });
  });

  it('returns null when there is no colon verb', () => {
    expect(parseCustomMethodPath('/grocery-items')).toBeNull();
    expect(parseCustomMethodPath('/grocery-items/abc')).toBeNull();
  });

  it('returns null when the colon is not in the final segment', () => {
    expect(parseCustomMethodPath('/users/:login/extra')).toBeNull();
  });
});

describe('dispatchCustomMethod', () => {
  it('passes the request through to aepbase when no colon verb is present', async () => {
    const passthrough = vi.fn(async () => Response.json({ proxied: true }));
    const res = await dispatchCustomMethod({
      request: new Request('http://localhost/api/aep/grocery-items'),
      path: '/grocery-items',
      resolveMethod: () => undefined,
      authenticate: vi.fn(),
      passthrough,
    });
    expect(passthrough).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ proxied: true });
  });

  it('passes through colon paths that are not registered methods (e.g. :download)', async () => {
    const passthrough = vi.fn(async () => Response.json({ proxied: true }));
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/gift-cards/g1:download',
      resolveMethod: () => undefined,
      authenticate: vi.fn(),
      passthrough,
    });
    expect(passthrough).toHaveBeenCalledOnce();
    expect(await res.json()).toEqual({ proxied: true });
  });

  it('passes through when the registered method targets a different scope', async () => {
    const passthrough = vi.fn(async () => Response.json({ proxied: true }));
    const handler = vi.fn();
    // Registered as an item method, but the path addresses a collection.
    await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler, { target: 'item' }),
      authenticate: vi.fn(),
      passthrough,
    });
    expect(passthrough).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 405 with an Allow header when the method does not match', async () => {
    const handler = vi.fn();
    const res = await dispatchCustomMethod({
      request: makeRequest('GET'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler, { method: 'POST' }),
      authenticate: vi.fn(),
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers (custom methods always require auth)', async () => {
    const handler = vi.fn();
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler),
      authenticate: async () => null,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes auth + parsed address through to the handler', async () => {
    const handler = vi.fn(async ({ auth, plural, verb, target }) =>
      Response.json({ userId: auth.user.id, plural, verb, target }),
    );
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: 'u1',
      plural: 'grocery-items',
      verb: 'process-image',
      target: 'collection',
    });
    expect(handler.mock.calls[0][0]).toMatchObject({ auth: fakeAuth });
  });

  it('exposes the addressed id for item-target methods', async () => {
    const handler = vi.fn(async ({ id }) => Response.json({ id }));
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/hsa-receipts/abc123:archive',
      resolveMethod: () => makeMethod(handler, { target: 'item' }),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(await res.json()).toEqual({ id: 'abc123' });
  });

  it('defaults the method to POST when none is declared', async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const resolveMethod = (): ResourceCustomMethod => ({
      load: async () => ({ default: handler }),
    });
    const ok = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod,
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(ok.status).toBe(200);

    const wrong = await dispatchCustomMethod({
      request: makeRequest('GET'),
      path: '/grocery-items:process-image',
      resolveMethod,
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(wrong.status).toBe(405);
  });

  it('returns 500 when the lazy import fails', async () => {
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => ({
        load: async () => {
          throw new Error('boom');
        },
      }),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      type: 'about:blank',
      status: 500,
      detail: 'Failed to load custom method',
      error: { code: 500, message: 'Failed to load custom method' },
    });
  });

  it('returns 500 when the handler throws, surfacing the message', async () => {
    const handler = vi.fn(async () => {
      throw new Error('handler exploded');
    });
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      status: 500,
      detail: 'handler exploded',
      error: { code: 500, message: 'handler exploded' },
    });
  });

  it('keeps the status a thrown ProblemError carries', async () => {
    const handler = vi.fn(async () => {
      throw new ProblemError(422, 'that image is blank');
    });
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ title: 'Unprocessable Content', detail: 'that image is blank' });
  });

  it("brings a handler's own error body into the standard shape", async () => {
    const handler = vi.fn(async () =>
      Response.json(
        { error: 'Bad request', message: 'Missing image' },
        { status: 400, headers: { 'Retry-After': '5' } },
      ),
    );
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(handler),
      authenticate: async () => fakeAuth,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(await res.json()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'Missing image',
      error: { code: 400, message: 'Missing image' },
    });
  });

  it('answers 401 in the standard shape', async () => {
    const res = await dispatchCustomMethod({
      request: makeRequest('POST'),
      path: '/grocery-items:process-image',
      resolveMethod: () => makeMethod(vi.fn()),
      authenticate: async () => null,
      passthrough: neverPassthrough,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ status: 401, error: { code: 401 } });
  });

  describe('async (AEP-151) methods', () => {
    /** A fake OperationStore whose `complete` resolves a promise the test awaits. */
    function makeOperationStore(op: { id: string; path: string; done: boolean }) {
      let resolveComplete: () => void = () => {};
      const completed = new Promise<void>((r) => {
        resolveComplete = r;
      });
      const operations = {
        create: vi.fn(async () => op),
        complete: vi.fn(async () => {
          resolveComplete();
        }),
        updateMetadata: vi.fn(async () => {}),
      };
      return { operations, completed };
    }

    it('returns 202 with the pending operation and records the response on success', async () => {
      const { operations, completed } = makeOperationStore({
        id: 'op1',
        path: 'operations/op1',
        done: false,
      });
      const handler = vi.fn(async () => ({ ok: true }));

      const res = await dispatchCustomMethod({
        request: makeRequest('POST'),
        path: '/grocery-items:long-task',
        resolveMethod: () => makeMethod(handler, { async: true }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(202);
      expect(await res.json()).toMatchObject({ id: 'op1', done: false });
      expect(operations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'tok',
          method: 'grocery-items:long-task',
          createdBy: 'u1',
        }),
      );

      await completed;
      expect(handler).toHaveBeenCalledOnce();
      expect(operations.complete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'op1', response: { ok: true } }),
      );
    });

    it('threads ctx.log into the async handler and records the timeline in metadata.logs', async () => {
      const { operations, completed } = makeOperationStore({
        id: 'op-log',
        path: 'operations/op-log',
        done: false,
      });
      let sawLog: unknown;
      const handler = vi.fn(async (ctx) => {
        sawLog = ctx.log;
        await ctx.log?.('working…');
        return { ok: true };
      });

      const res = await dispatchCustomMethod({
        request: makeRequest('POST'),
        path: '/grocery-items:long-task',
        resolveMethod: () => makeMethod(handler, { async: true }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(202);
      await completed;

      // The handler received a callable log function…
      expect(typeof sawLog).toBe('function');
      // …and the run was bracketed with started/succeeded around its own entry.
      const lastWrite = operations.updateMetadata.mock.calls.at(-1)?.[0] as
        | { metadata: { logs: { message: string }[] } }
        | undefined;
      expect(lastWrite?.metadata.logs.map((e) => e.message)).toEqual([
        'started',
        'working…',
        'succeeded',
      ]);
    });

    it('does not give the pre-flight validate a log function', async () => {
      const { operations } = makeOperationStore({
        id: 'op-validate-log',
        path: 'operations/op-validate-log',
        done: false,
      });
      const handler = vi.fn(async () => ({}));
      let validateHadLog = true;
      const validate = vi.fn(async (ctx) => {
        validateHadLog = 'log' in ctx && ctx.log !== undefined;
        return Response.json({ error: 'nope' }, { status: 503 });
      });

      await dispatchCustomMethod({
        request: makeRequest('POST', { image: 'x' }),
        path: '/hsa-receipts:parse-receipt',
        resolveMethod: () => ({
          target: 'collection',
          async: true,
          load: async () => ({ default: handler, validate }),
        }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(validate).toHaveBeenCalledOnce();
      expect(validateHadLog).toBe(false);
    });

    it('records the error when the async handler throws', async () => {
      const { operations, completed } = makeOperationStore({
        id: 'op2',
        path: 'operations/op2',
        done: false,
      });
      const handler = vi.fn(async () => {
        throw new Error('async boom');
      });

      const res = await dispatchCustomMethod({
        request: makeRequest('POST'),
        path: '/grocery-items:long-task',
        resolveMethod: () => makeMethod(handler, { async: true }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(202);
      await completed;
      expect(operations.complete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'op2', error: expect.any(Error) }),
      );
    });

    it('lets the background handler read the request body after the 202', async () => {
      const { operations, completed } = makeOperationStore({
        id: 'op-body',
        path: 'operations/op-body',
        done: false,
      });
      // The 202 is sent before the handler runs, so the body must be buffered.
      const handler = vi.fn(async ({ request }) => await request.json());

      const res = await dispatchCustomMethod({
        request: makeRequest('POST', { hello: 'world' }),
        path: '/grocery-items:long-task',
        resolveMethod: () => makeMethod(handler, { async: true }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(202);
      await completed;
      expect(operations.complete).toHaveBeenCalledWith(
        expect.objectContaining({ response: { hello: 'world' } }),
      );
    });

    it('rejects pre-flight without creating an operation', async () => {
      const { operations } = makeOperationStore({
        id: 'op-preflight',
        path: 'operations/op-preflight',
        done: false,
      });
      const handler = vi.fn(async () => ({}));
      const validate = vi.fn(async () =>
        Response.json({ error: 'Service unavailable' }, { status: 503 }),
      );

      const res = await dispatchCustomMethod({
        request: makeRequest('POST', { image: 'x' }),
        path: '/hsa-receipts:parse-receipt',
        resolveMethod: () => ({
          target: 'collection',
          async: true,
          load: async () => ({ default: handler, validate }),
        }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(503);
      expect(operations.create).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('creates the operation with the declared title once validate passes', async () => {
      const { operations, completed } = makeOperationStore({
        id: 'op-title',
        path: 'operations/op-title',
        done: false,
      });
      const handler = vi.fn(async () => ({ ok: true }));
      const validate = vi.fn(async () => undefined);

      const res = await dispatchCustomMethod({
        request: makeRequest('POST', { image: 'x' }),
        path: '/hsa-receipts:parse-receipt',
        resolveMethod: () => ({
          target: 'collection',
          async: true,
          title: 'Parse receipt',
          load: async () => ({ default: handler, validate }),
        }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
        operations,
      });

      expect(res.status).toBe(202);
      expect(validate).toHaveBeenCalledOnce();
      expect(operations.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Parse receipt' }),
      );
      await completed;
    });

    it('returns 500 when an async method is dispatched without an operation store', async () => {
      const handler = vi.fn(async () => ({}));
      const res = await dispatchCustomMethod({
        request: makeRequest('POST'),
        path: '/grocery-items:long-task',
        resolveMethod: () => makeMethod(handler, { async: true }),
        authenticate: async () => fakeAuth,
        passthrough: neverPassthrough,
      });
      expect(res.status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
