/**
 * node:http → fetch-handler bridge, shared by the dev front (dev-vite.ts)
 * and the Node production listeners (listen.ts).
 *
 * Hand-rolled rather than @hono/node-server's getRequestListener: that
 * helper replaces the global Response with a "lightweight" class that
 * Bun.serve (the internal listener under Bun) rejects.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export type FetchHandler = (request: Request) => Response | Promise<Response>;

export async function bridge(
  req: IncomingMessage,
  res: ServerResponse,
  fetchFn: FetchHandler,
): Promise<void> {
  const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const vv of v) headers.append(k, vv);
    } else {
      headers.set(k, v);
    }
  }
  const method = req.method ?? 'GET';
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    // Buffer the body rather than streaming it through: the node request
    // must be fully consumed even when the handler never reads it (405s,
    // auth rejections), or the next request on the same keep-alive
    // connection can desync.
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    if (chunks.length > 0) init.body = new Uint8Array(Buffer.concat(chunks));
  }

  let response: Response;
  try {
    response = await fetchFn(new Request(url, init));
  } catch (err) {
    res.statusCode = 500;
    res.end(err instanceof Error ? err.message : 'internal error');
    return;
  }

  const outHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of response.headers.entries()) {
    if (k === 'set-cookie') continue;
    outHeaders[k] = v;
  }
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) outHeaders['set-cookie'] = setCookies;
  res.writeHead(response.status, outHeaders);

  if (response.body) {
    const reader = response.body.getReader();
    // A client that hangs up mid-body (a tab closing on /api/events) must
    // cancel the stream, or an endless one keeps its producer alive forever.
    const cancel = () => void reader.cancel().catch(() => {});
    res.once('close', cancel);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.off('close', cancel);
    }
  }
  res.end();
}
