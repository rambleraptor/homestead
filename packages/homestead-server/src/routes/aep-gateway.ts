/**
 * /api/aep gateway — owns the AEP-136 custom-method URLs that live on a
 * resource (`POST /<plural>:<verb>` and `POST /<plural>/<id>:<verb>`),
 * dispatching app-declared handlers and passing everything else (aepbase's
 * own `:login`/`:download`, plain CRUD) to the engine **in-process** — no
 * loopback hop.
 */

import { Hono } from 'hono';
import { authenticate } from '@rambleraptor/homestead-core/server/aepbase';
import { operationStore } from '@rambleraptor/homestead-core/server/operations';
import { dispatchCustomMethod } from '@rambleraptor/homestead-core/resources/custom-methods/dispatcher';
import { unsupportedConditional } from '../engine/preconditions';
import {
  allBulkImportCustomMethods,
  bulkImportCustomMethod,
} from '@rambleraptor/homestead-core/server/bulk-import/method';
import {
  allBulkExportCustomMethods,
  bulkExportCustomMethod,
} from '@rambleraptor/homestead-core/server/bulk-export/method';
import { getResourceCustomMethod, getAllResourceCustomMethods } from '../app-registry';
import { handleCrudWithIndexing } from './file-index-trigger';
import { injectCustomMethods } from './openapi-custom-methods';
import type { Engine } from '../engine/engine';

/**
 * An explicit `customMethods` entry wins over the synthesized `:bulk-import` /
 * `:bulk-export`, so a resource with unusual needs can still hand-write the verb.
 */
function resolveMethod(plural: string, verb: string) {
  return (
    getResourceCustomMethod(plural, verb) ??
    bulkImportCustomMethod(plural, verb) ??
    bulkExportCustomMethod(plural, verb)
  );
}

const PREFIX = '/api/aep';

export function makeAepGateway(engine: Engine, engineOrigin: string): Hono {
  const gateway = new Hono();

  /**
   * Hand an untouched request to the engine, preserving method/body. The
   * engine only reads the request's pathname + query; `engineOrigin` just
   * makes the URL absolute so `new Request(...)` can parse it.
   */
  function passthrough(request: Request, path: string): Promise<Response> {
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers: request.headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      init.duplex = 'half';
    }
    return engine.fetch(new Request(`${engineOrigin}${path}`, init));
  }

  gateway.all('/*', async (c) => {
    const url = new URL(c.req.url);
    // The engine-relative path (everything after `/api/aep`), query included.
    const path = url.pathname.slice(PREFIX.length) + url.search;

    // The engine builds /openapi.json from its own registry and can't see
    // app-declared custom methods (the gateway owns those). Enrich its doc on
    // the way out so custom methods appear as first-class AEP-136 paths.
    if (c.req.method === 'GET' && url.pathname.slice(PREFIX.length).split('?')[0] === '/openapi.json') {
      const res = await passthrough(c.req.raw, path);
      if (!res.ok) return res;
      const doc = (await res.json()) as Parameters<typeof injectCustomMethods>[0];
      injectCustomMethods(doc, {
        ...allBulkImportCustomMethods(),
        ...allBulkExportCustomMethods(),
        ...getAllResourceCustomMethods(),
      });
      return Response.json(doc);
    }

    // AEP-154: a custom method (`…/{id}:verb`, `…/{plural}:verb`) has no
    // precondition support, so a conditional header on one is refused rather
    // than ignored. Standard methods pass through to the engine, which checks
    // them.
    const lastSegment = url.pathname.split('/').pop() ?? '';
    if (lastSegment.includes(':')) {
      const unsupported = unsupportedConditional(c.req.raw, 'a custom method');
      if (unsupported) return unsupported;
    }

    // Auto-index uploads to `ai`-enabled file fields. Returns null for anything
    // it doesn't own (custom methods, non-file writes) so dispatch proceeds.
    const indexed = await handleCrudWithIndexing(c.req.raw, path, passthrough);
    if (indexed) return indexed;

    return dispatchCustomMethod({
      request: c.req.raw,
      path,
      resolveMethod,
      authenticate,
      passthrough,
      operations: operationStore,
    });
  });

  return gateway;
}
