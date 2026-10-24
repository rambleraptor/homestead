import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import type { FileDescriptor } from '@rambleraptor/homestead-client';
import {
  ATTACHMENT_TURNS,
  MAX_ATTACHMENT_BYTES,
  checkAttachments,
  withAttachments,
} from '../attachments';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const file = (id: string, name = `${id}.png`): FileDescriptor => ({
  id,
  url: '',
  name,
  media_type: 'image/png',
  size: PNG.length,
  encrypted: false,
});

describe('checkAttachments', () => {
  it('types each file by its bytes', async () => {
    const out = await checkAttachments([new File([PNG], 'photo.pdf', { type: 'application/pdf' })]);
    expect(out.ok && out.files[0]!.type).toBe('image/png');
  });

  it('refuses what the models cannot read, and oversized files', async () => {
    const html = await checkAttachments([new File(['<html>'], 'a.png', { type: 'image/png' })]);
    expect(html).toMatchObject({ ok: false, status: 415 });
    const big = await checkAttachments([new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], 'big.png')]);
    expect(big).toMatchObject({ ok: false, status: 413 });
  });
});

describe('withAttachments', () => {
  const user = (id: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text: id }] });

  it('shows the files of the latest messages that have any, and notes older ones', async () => {
    const ids = Array.from({ length: ATTACHMENT_TURNS + 1 }, (_, i) => `m${i}`);
    const stored = ids.map((id) => ({ id, role: 'user' as const, attachments: [file(`f-${id}`)] }));
    const reads: string[] = [];
    const ui = await withAttachments(ids.map(user), stored, async (messageId, f) => {
      reads.push(`${messageId}/${f.id}`);
      return PNG;
    });

    // The oldest is a note; it isn't even read.
    expect(ui[0]!.parts.at(-1)).toEqual({
      type: 'text',
      text: '[Attached earlier, no longer shown: f-m0.png]',
    });
    expect(reads).not.toContain('m0/f-m0');
    // The rest carry their bytes inline — a data URL, never one to fetch.
    const shown = ui[ATTACHMENT_TURNS]!.parts.at(-1) as { type: string; url: string; filename: string };
    expect(shown.type).toBe('file');
    expect(shown.filename).toBe(`f-m${ATTACHMENT_TURNS}.png`);
    expect(shown.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(reads).toHaveLength(ATTACHMENT_TURNS);
  });

  it('turns an unreadable file into a note instead of failing the turn', async () => {
    const ui = await withAttachments([user('m')], [{ id: 'm', role: 'user', attachments: [file('gone')] }], async () => {
      throw new Error('404');
    });
    expect(ui[0]!.parts.at(-1)).toEqual({ type: 'text', text: "[Attached, but couldn't be read: gone.png]" });
  });
});
