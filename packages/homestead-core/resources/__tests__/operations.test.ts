import { describe, expect, test, vi } from 'vitest';
import {
  makeOperationLogger,
  toOperationError,
  type OperationStore,
  type UpdateMetadataInput,
} from '../operations';
import { ProblemError } from '../problem';

/**
 * A store that records every metadata write and can be gated so tests can
 * control when each `updateMetadata` resolves (to probe serialization).
 */
function recordingStore(gate?: () => Promise<void>) {
  const writes: UpdateMetadataInput[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;
  const store: OperationStore = {
    create: vi.fn(),
    complete: vi.fn(),
    async updateMetadata(input) {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      writes.push(input);
      if (gate) await gate();
      inFlight--;
    },
  };
  return { store, writes, maxConcurrent: () => maxConcurrent };
}

describe('makeOperationLogger', () => {
  test('appends { time, message } entries and persists the full array each time', async () => {
    const { store, writes } = recordingStore();
    const logger = makeOperationLogger(store, { token: 'tok', id: 'op1' });

    await logger.log('first');
    await logger.log('second');

    expect(logger.logs.map((e) => e.message)).toEqual(['first', 'second']);
    expect(logger.logs.every((e) => !Number.isNaN(Date.parse(e.time)))).toBe(true);

    // Each write carries the full timeline known at that point.
    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({
      token: 'tok',
      id: 'op1',
      metadata: { logs: [expect.objectContaining({ message: 'first' })] },
    });
    expect(
      (writes[1].metadata.logs as { message: string }[]).map((e) => e.message),
    ).toEqual(['first', 'second']);
  });

  test('serializes writes: never more than one in flight, and they land in order', async () => {
    let release!: () => void;
    let gate = new Promise<void>((r) => (release = r));
    const { store, writes, maxConcurrent } = recordingStore(() => gate);
    const logger = makeOperationLogger(store, { token: 't', id: 'op' });

    // Fire several without awaiting — they must queue, not overlap.
    const p1 = logger.log('a');
    const p2 = logger.log('b');
    const p3 = logger.log('c');

    // Synchronous ordering holds immediately.
    expect(logger.logs.map((e) => e.message)).toEqual(['a', 'b', 'c']);

    // Let the writes drain one at a time.
    release();
    gate = Promise.resolve();
    await Promise.all([p1, p2, p3]);

    expect(maxConcurrent()).toBe(1);
    expect(writes.map((w) => (w.metadata.logs as { message: string }[]).at(-1)?.message)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  test('swallows a persistence failure without breaking the chain', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store: OperationStore = {
      create: vi.fn(),
      complete: vi.fn(),
      updateMetadata: vi
        .fn()
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValue(undefined),
    };
    const logger = makeOperationLogger(store, { token: 't', id: 'op' });

    // The first write rejects internally, but log() still resolves…
    await expect(logger.log('boom')).resolves.toBeUndefined();
    // …and the chain survives so later logs still persist.
    await expect(logger.log('after')).resolves.toBeUndefined();

    expect(store.updateMetadata).toHaveBeenCalledTimes(2);
    expect(logger.logs.map((e) => e.message)).toEqual(['boom', 'after']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('toOperationError', () => {
  test('coerces Error, object, and primitive throws', () => {
    const internal = { type: 'about:blank', title: 'Internal Server Error', status: 500 };
    expect(toOperationError(new Error('x'))).toEqual({ ...internal, detail: 'x' });
    expect(toOperationError({ message: 'odd' })).toEqual({ ...internal, detail: 'odd' });
    expect(toOperationError('plain')).toEqual({ ...internal, detail: 'plain' });
  });

  test('keeps the status a ProblemError carries', () => {
    expect(toOperationError(new ProblemError(410, 'gone'))).toEqual({
      type: 'about:blank',
      title: 'Gone',
      status: 410,
      detail: 'gone',
    });
  });
});
