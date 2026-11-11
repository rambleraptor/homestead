/**
 * documents-ingest-email cron handler. The email provider and the aepbase
 * helpers are mocked, so these assert the ingestion logic: which attachments
 * are uploaded, how dedup and duplicate filenames are handled, when a message
 * is trashed, and the classify trigger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  EmailMessage,
  EmailMessageRef,
} from '@rambleraptor/homestead-core/server/email/types';
import type { Document } from '../../types';

// --- mocks ---
const provider = {
  listMessages: vi.fn(),
  getMessage: vi.fn(),
  getAttachment: vi.fn(),
  sendMessage: vi.fn(),
  trashMessage: vi.fn(),
};
const isEmailConfigured = vi.fn();
const getEmailConfig = vi.fn();
const isAiConfigured = vi.fn();

vi.mock('@rambleraptor/homestead-core/server/email/config', () => ({
  isEmailConfigured: () => isEmailConfigured(),
  getEmailConfig: () => getEmailConfig(),
  getEmailProvider: () => provider,
}));
vi.mock('@rambleraptor/homestead-core/server/ai/config', () => ({
  isAiConfigured: () => isAiConfigured(),
}));

import { createFakeServerClient } from '@rambleraptor/homestead-core/server/__tests__/fake-server-client';

const fake = createFakeServerClient();
vi.mock('@rambleraptor/homestead-core/server/client', () => ({
  serverClient: () => fake.client,
}));

const { listAllFn, createFn, invokeFn } = fake;

import handler from '../ingest-email';

const ctx = {
  id: 'documents-ingest-email',
  appId: 'documents',
  token: 'admin-tok',
  writeOrigin: 'cron:documents-ingest-email',
  firedAt: '2026-07-23T00:00:00.000Z',
  log: vi.fn(async () => {}),
};

function pdfAttachment(over: Partial<EmailMessage['attachments'][number]> = {}) {
  return { id: 'att-1', filename: 'receipt.pdf', mimeType: 'application/pdf', size: 10, ...over };
}

function message(over: Partial<EmailMessage> = {}): EmailMessage {
  return { id: 'm1', attachments: [pdfAttachment()], ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  isEmailConfigured.mockReturnValue(true);
  getEmailConfig.mockReturnValue({ query: 'has:attachment' });
  isAiConfigured.mockReturnValue(true);
  listAllFn.mockResolvedValue([]);
  createFn.mockResolvedValue({ id: 'doc-1' } as Document);
  invokeFn.mockResolvedValue({});
  // Distinct bytes per attachment by default, so content-hash dedup only fires
  // in the tests that deliberately supply identical bytes.
  provider.getAttachment.mockImplementation(async (_msgId: string, attId: string) =>
    Buffer.from(`bytes-${attId}`),
  );
  provider.trashMessage.mockResolvedValue(undefined);
});

describe('documents-ingest-email', () => {
  it('no-ops when email is unconfigured', async () => {
    isEmailConfigured.mockReturnValue(false);
    const result = await handler(ctx);
    expect(result).toEqual({ skipped: true });
    expect(provider.listMessages).not.toHaveBeenCalled();
  });

  it('uploads a supported attachment, fires classify, and trashes the message', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }] as EmailMessageRef[]);
    provider.getMessage.mockResolvedValue(message());

    const result = await handler(ctx);

    expect(provider.getAttachment).toHaveBeenCalledWith('m1', 'att-1');
    expect(createFn).toHaveBeenCalledTimes(1);
    const [path, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/documents');
    expect(body).toMatchObject({
      title: 'receipt',
      mime_type: 'application/pdf',
      parse_status: 'pending',
      source_email_id: 'm1',
      source_email_attachment: '0:receipt.pdf',
      content_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    // The file rides on the create body as a named File (auto-multipart).
    expect(body.file).toBeInstanceOf(File);
    expect((body.file as File).name).toBe('receipt.pdf');
    expect((body.file as File).type).toBe('application/pdf');

    // classify fired against the new doc via the item-target custom method
    expect(invokeFn).toHaveBeenCalledWith('/documents/doc-1', 'classify', {});
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ messages: 1, uploaded: 1, bodies: 0, skipped: 0, duplicates: 0, trashed: 1 });
  });

  it('uses the configured query, defaulting to has:attachment', async () => {
    getEmailConfig.mockReturnValue({ query: 'label:homestead has:attachment' });
    provider.listMessages.mockResolvedValue([]);
    await handler(ctx);
    expect(provider.listMessages).toHaveBeenCalledWith({
      query: 'label:homestead has:attachment',
      maxResults: expect.any(Number),
    });
  });

  it('skips an already-filed attachment but still trashes the message', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(message());
    // Existing document for this message + attachment key.
    listAllFn.mockResolvedValue([
      { id: 'old', source_email_attachment: '0:receipt.pdf' } as Document,
    ]);

    const result = await handler(ctx);

    expect(createFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ messages: 1, uploaded: 0, bodies: 0, skipped: 1, duplicates: 0, trashed: 1 });
  });

  it('hard-blocks an attachment whose content hash already exists, still trashing', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(message());
    // No same-message provenance match, but an existing doc has the same bytes.
    listAllFn.mockImplementation(async (_path: string, opts?: unknown) =>
      (opts as { filter?: string })?.filter?.startsWith('content_hash')
        ? [{ id: 'existing' } as Document]
        : [],
    );

    const result = await handler(ctx);

    // Blocked before any upload — the duplicate is not filed again.
    expect(createFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ messages: 1, uploaded: 0, bodies: 0, skipped: 0, duplicates: 1, trashed: 1 });
  });

  it('hard-blocks a second identical attachment within the same run', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          pdfAttachment({ id: 'a1', filename: 'first.pdf' }),
          pdfAttachment({ id: 'a2', filename: 'second.pdf' }),
        ],
      }),
    );
    // Both attachments return the same bytes → same hash. Nothing pre-exists.
    provider.getAttachment.mockResolvedValue(Buffer.from('identical-bytes'));

    const result = await handler(ctx);

    // First filed, second blocked as an in-run duplicate.
    expect(createFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ messages: 1, uploaded: 1, bodies: 0, skipped: 0, duplicates: 1, trashed: 1 });
  });

  it('uploads both attachments that share a filename (distinct keys)', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          pdfAttachment({ id: 'a1', filename: 'scan.pdf' }),
          pdfAttachment({ id: 'a2', filename: 'scan.pdf' }),
        ],
      }),
    );

    const result = await handler(ctx);

    expect(createFn).toHaveBeenCalledTimes(2);
    const keys = createFn.mock.calls.map(
      (c) => (c[1] as Record<string, unknown>).source_email_attachment,
    );
    expect(keys).toEqual(['0:scan.pdf', '1:scan.pdf']);
    expect(result.uploaded).toBe(2);
    expect(result.trashed).toBe(1);
  });

  it('ignores unsupported attachments and leaves a bodyless message alone', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          { id: 'z', filename: 'invite.ics', mimeType: 'text/calendar' },
          { id: 'z2', filename: 'archive.zip', mimeType: 'application/zip' },
        ],
      }),
    );

    const result = await handler(ctx);

    expect(createFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).not.toHaveBeenCalled();
    expect(result).toEqual({
      messages: 1, uploaded: 0, bodies: 0, skipped: 0, duplicates: 0, trashed: 0,
    });
    // An all-zero run must say what it dropped, or it's undiagnosable.
    expect(ctx.log).toHaveBeenCalledWith(
      'message m1: skipping unimportant attachment(s): invite.ics (text/calendar), archive.zip (application/zip)',
    );
  });

  it('logs an unsupported attachment even when the message is trashed', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          pdfAttachment(),
          { id: 'z', filename: 'notes.docx', mimeType: 'application/vnd.ms-word' },
        ],
      }),
    );

    const result = await handler(ctx);

    expect(result.uploaded).toBe(1);
    // Trashing takes the dropped attachment with it — that has to be on record.
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(ctx.log).toHaveBeenCalledWith(
      'message m1: skipping unimportant attachment(s): notes.docx (application/vnd.ms-word)',
    );
  });

  it('leaves a message with neither ingestible attachments nor a body in place', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(message({ attachments: [] }));

    const result = await handler(ctx);

    expect(result).toEqual({
      messages: 1, uploaded: 0, bodies: 0, skipped: 0, duplicates: 0, trashed: 0,
    });
    expect(ctx.log).toHaveBeenCalledWith(
      'message m1: no ingestible attachments and no readable body; leaving in place',
    );
  });

  it('files the email body when the message has no attachments', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [],
        from: { name: 'Apple', email: 'receipts@apple.com' },
        date: '2026-07-22T18:00:00.000Z',
        subject: 'Your receipt from Apple',
        body: { html: '<p>Total: <b>$42.00</b></p>' },
      }),
    );

    const result = await handler(ctx);

    expect(createFn).toHaveBeenCalledTimes(1);
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      title: 'Your receipt from Apple',
      mime_type: 'text/plain',
      parse_status: 'pending',
      source_email_id: 'm1',
      source_email_attachment: 'body',
      content_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const file = body.file as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('Your receipt from Apple.txt');
    expect(file.type).toBe('text/plain');
    // Provenance headers over the stripped HTML body. (jsdom's File has no
    // .text(); read it the DOM way.)
    const fileText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
    expect(fileText).toBe(
      'From: Apple <receipts@apple.com>\n' +
        'Date: 2026-07-22T18:00:00.000Z\n' +
        'Subject: Your receipt from Apple\n\n' +
        'Total: $42.00',
    );

    expect(invokeFn).toHaveBeenCalledWith('/documents/doc-1', 'classify', {});
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({
      messages: 1, uploaded: 1, bodies: 1, skipped: 0, duplicates: 0, trashed: 1,
    });
  });

  it('falls back to the body when the only image attachment is chrome-sized', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          { id: 'logo', filename: 'logo.png', mimeType: 'image/png', size: 4_000 },
        ],
        subject: 'Order confirmation',
        body: { text: 'Thanks for your order.' },
      }),
    );

    const result = await handler(ctx);

    // The tiny logo is never fetched or filed; the body is the document.
    expect(provider.getAttachment).not.toHaveBeenCalled();
    expect(createFn).toHaveBeenCalledTimes(1);
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.source_email_attachment).toBe('body');
    expect(ctx.log).toHaveBeenCalledWith(
      'message m1: skipping unimportant attachment(s): logo.png (image/png)',
    );
    expect(result.bodies).toBe(1);
    expect(result.trashed).toBe(1);
  });

  it('files a large image attachment instead of the body', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          { id: 'scan', filename: 'scan.jpg', mimeType: 'image/jpeg', size: 500_000 },
        ],
        body: { text: 'See attached scan.' },
      }),
    );

    const result = await handler(ctx);

    expect(createFn).toHaveBeenCalledTimes(1);
    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({
      mime_type: 'image/jpeg',
      source_email_attachment: '0:scan.jpg',
    });
    expect(result).toEqual({
      messages: 1, uploaded: 1, bodies: 0, skipped: 0, duplicates: 0, trashed: 1,
    });
  });

  it('gives an image with no reported size the benefit of the doubt', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [{ id: 'p', filename: 'photo.jpg', mimeType: 'image/jpeg' }],
        body: { text: 'photo attached' },
      }),
    );

    const result = await handler(ctx);

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.source_email_attachment).toBe('0:photo.jpg');
    expect(result.bodies).toBe(0);
    expect(result.uploaded).toBe(1);
  });

  it('skips an already-filed body but still trashes the message', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({ attachments: [], subject: 'Receipt', body: { text: 'Total $5' } }),
    );
    listAllFn.mockResolvedValue([
      { id: 'old', source_email_attachment: 'body' } as Document,
    ]);

    const result = await handler(ctx);

    expect(createFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({
      messages: 1, uploaded: 0, bodies: 0, skipped: 1, duplicates: 0, trashed: 1,
    });
  });

  it('hard-blocks a body whose content hash already exists, still trashing', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({ attachments: [], subject: 'Receipt', body: { text: 'Total $5' } }),
    );
    listAllFn.mockImplementation(async (_path: string, opts?: unknown) =>
      (opts as { filter?: string })?.filter?.startsWith('content_hash')
        ? [{ id: 'existing' } as Document]
        : [],
    );

    const result = await handler(ctx);

    expect(createFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
    expect(result).toEqual({
      messages: 1, uploaded: 0, bodies: 0, skipped: 0, duplicates: 1, trashed: 1,
    });
  });

  it('titles a subjectless body document after its sender', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [],
        from: { email: 'noreply@store.example' },
        body: { text: 'Your order shipped.' },
      }),
    );

    await handler(ctx);

    const [, body] = createFn.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.title).toBe('Email from noreply@store.example');
    expect((body.file as File).name).toBe('Email from noreply@store.example.txt');
  });

  it('does not trash a message when an upload fails', async () => {
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(
      message({
        attachments: [
          pdfAttachment({ id: 'a1', filename: 'good.pdf' }),
          pdfAttachment({ id: 'a2', filename: 'bad.pdf' }),
        ],
      }),
    );
    createFn
      .mockResolvedValueOnce({ id: 'doc-good' })
      .mockRejectedValueOnce(new Error('boom'));

    const result = await handler(ctx);

    expect(result.uploaded).toBe(1);
    expect(provider.trashMessage).not.toHaveBeenCalled();
    expect(result.trashed).toBe(0);
  });

  it('does not fire classify when AI is unconfigured', async () => {
    isAiConfigured.mockReturnValue(false);
    provider.listMessages.mockResolvedValue([{ id: 'm1' }]);
    provider.getMessage.mockResolvedValue(message());

    await handler(ctx);

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(invokeFn).not.toHaveBeenCalled();
    expect(provider.trashMessage).toHaveBeenCalledWith('m1');
  });
});
