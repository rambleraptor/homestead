import type { PendingLink, Store } from './store';

interface Row extends PendingLink {
  box: string;
  receivedMs: number;
}

/** The drop box's storage, in memory: for tests, and for a stand-in Homestead's specs run against. */
export function memoryStore(): Store {
  const boxes = new Set<string>();
  let rows: Row[] = [];
  let seq = 0;

  return {
    async hasBox(box) {
      return boxes.has(box);
    },
    async putBox(box) {
      boxes.add(box);
    },
    async deleteBox(box) {
      boxes.delete(box);
      rows = rows.filter((row) => row.box !== box);
    },
    async listLinks(box, limit) {
      return rows
        .filter((row) => row.box === box)
        .slice(0, limit)
        .map(({ id, seq: s, url, received_at }) => ({ id, seq: s, url, received_at }));
    },
    async countLinks(box) {
      return rows.filter((row) => row.box === box).length;
    },
    async addLink(box, link, now) {
      seq += 1;
      rows.push({ ...link, box, seq, receivedMs: now, received_at: new Date(now).toISOString() });
    },
    async ackLinks(box, throughSeq) {
      const before = rows.length;
      rows = rows.filter((row) => row.box !== box || row.seq > throughSeq);
      return before - rows.length;
    },
    async purgeBefore(cutoff) {
      const before = rows.length;
      rows = rows.filter((row) => row.receivedMs >= cutoff);
      return before - rows.length;
    },
  };
}
