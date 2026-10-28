/**
 * Does a photo read as well inside a PDF as it does on its own?
 *
 * Before combining photos into one PDF per document, check that the model reads
 * a photo wrapped in a PDF page (built by `imagesToPdf`, exactly as the app
 * would) as well as the photo itself. Providers rasterize a PDF page their own
 * way, so fine print could fare differently.
 *
 * For each photo it uploads two documents — the photo, and a one-page PDF of it
 * — to a running Homestead, classifies both (`--repeat` times, to tell model
 * noise from a real difference), waits for the extracted text, and prints what
 * each read. With several photos it also uploads them combined, one page each.
 * The test documents are deleted afterwards unless `--keep` is passed.
 *
 * Usage (from the repo root):
 *   npx tsx packages/homestead-apps/documents/scripts/compare-pdf-pages.ts \
 *     [--server URL --token TOKEN | --profile NAME] [--repeat N] [--keep] \
 *     photo.jpg [more.jpg ...]
 *
 * Without --server/--token it uses a `homestead login` profile (the default, or
 * --profile), from ~/.homestead/credentials.json.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { bearerToken, createHomesteadClient } from '@rambleraptor/homestead-client';
import { imagesToPdf, type PageImage } from '../images-to-pdf';
import { readFacts } from '../doc-types/docType';
import { DOCUMENTS } from '../resources';
import type { Document } from '../types';

const PARSE_TIMEOUT_MS = 180_000;
const TEXT_TIMEOUT_MS = 120_000;
const POLL_MS = 1_000;

interface Variant {
  label: string;
  name: string;
  image: PageImage;
}

/** One classify run's result, flattened for comparison. */
type Reading = Record<string, string>;

function connection(args: { server?: string; token?: string; profile?: string }) {
  const server = args.server ?? process.env.HOMESTEAD_SERVER;
  const token = args.token ?? process.env.HOMESTEAD_TOKEN;
  if (server && token) return { server, token, userId: undefined };

  const dir = process.env.HOMESTEAD_CONFIG_DIR ?? join(homedir(), '.homestead');
  const creds = JSON.parse(readFileSync(join(dir, 'credentials.json'), 'utf8')) as {
    default?: string;
    profiles: Record<string, { server: string; token: string; userId?: string }>;
  };
  const label = args.profile ?? creds.default ?? Object.keys(creds.profiles)[0];
  const profile = label ? creds.profiles[label] : undefined;
  if (!profile) {
    throw new Error('No server: pass --server and --token, or run `homestead login` first.');
  }
  return profile;
}

function mediaTypeOf(path: string): string {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
  if (/\.png$/i.test(path)) return 'image/png';
  throw new Error(`${path}: only .jpg and .png photos can be compared`);
}

/** A classified document as flat `field → value` strings. */
function reading(doc: Document): Reading {
  const out: Reading = {
    doc_type: String(doc.metadata?.doc_type ?? '(none)'),
    parse_status: String(doc.parse_status),
  };
  for (const [key, value] of Object.entries(doc.metadata ?? {})) {
    if (key === 'doc_type' || key === 'facts') continue;
    out[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  for (const fact of readFacts(doc.metadata?.facts)) out[`fact: ${fact.label}`] = fact.value;
  return out;
}

/** Strings that look like identifiers — the fine print most at risk. */
function identifiers(text: string): Set<string> {
  const matches = text.match(/\b(?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]{4,}\b/gi) ?? [];
  return new Set(matches.map((m) => m.toUpperCase()));
}

function wordOverlap(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wa = words(a);
  const wb = words(b);
  const shared = [...wa].filter((w) => wb.has(w)).length;
  const all = new Set([...wa, ...wb]).size;
  return all ? shared / all : 1;
}

async function main() {
  const { values: args, positionals: photos } = parseArgs({
    allowPositionals: true,
    options: {
      server: { type: 'string' },
      token: { type: 'string' },
      profile: { type: 'string' },
      repeat: { type: 'string', default: '2' },
      keep: { type: 'boolean', default: false },
    },
  });
  if (!photos.length) throw new Error('Pass one or more .jpg/.png photos to compare.');
  const repeat = Math.max(1, Number(args.repeat) || 1);

  const { server, token, userId } = connection(args);
  const client = createHomesteadClient({
    baseUrl: `${server.replace(/\/$/, '')}/api/aep`,
    auth: bearerToken(token, userId),
  });
  const documents = client.collection<Document>(DOCUMENTS);

  const images = photos.map((path) => ({
    path,
    image: { bytes: new Uint8Array(readFileSync(path)), mediaType: mediaTypeOf(path) },
  }));
  const groups: { title: string; variants: Variant[] }[] = [];
  for (const { path, image } of images) {
    groups.push({
      title: basename(path),
      variants: [
        { label: 'photo', name: basename(path), image },
        {
          label: 'pdf',
          name: `${basename(path)}.pdf`,
          image: { bytes: await imagesToPdf([image]), mediaType: 'application/pdf' },
        },
      ],
    });
  }
  if (images.length > 1) {
    groups.push({
      title: `all ${images.length} photos as one PDF`,
      variants: [
        {
          label: 'combined',
          name: 'combined.pdf',
          image: {
            bytes: await imagesToPdf(images.map((i) => i.image)),
            mediaType: 'application/pdf',
          },
        },
      ],
    });
  }

  const created: string[] = [];
  try {
    // Upload everything first so the text extraction runs while classify does.
    const uploads = new Map<Variant, string>();
    for (const group of groups) {
      for (const variant of group.variants) {
        const form = new FormData();
        form.append(
          'resource',
          JSON.stringify({
            title: `fidelity check: ${variant.name}`,
            title_edited: true,
            tags: ['fidelity-check'],
            mime_type: variant.image.mediaType,
            parse_status: 'pending',
          }),
        );
        form.append(
          'file',
          new Blob([variant.image.bytes], { type: variant.image.mediaType }),
          variant.name,
        );
        const doc = await documents.create(form);
        created.push(doc.id);
        uploads.set(variant, doc.id);
      }
    }

    const readings = new Map<Variant, Reading[]>();
    for (let run = 1; run <= repeat; run += 1) {
      console.error(`Classifying, run ${run} of ${repeat}…`);
      for (const [variant, id] of uploads) {
        const record = documents.record(id);
        await record.update({ parse_status: 'pending' });
        await record.invoke('classify', {});
        const doc = await waitFor(() => record.get(), (d) => d.parse_status !== 'pending', PARSE_TIMEOUT_MS);
        readings.set(variant, [...(readings.get(variant) ?? []), reading(doc)]);
      }
    }

    // One shared deadline: an instance with no embedding model extracts no
    // text, and waiting on each document in turn would multiply the wait.
    console.error('Waiting for extracted text…');
    const pending = [...uploads];
    const extracted = await waitFor(
      () => Promise.all(pending.map(([, id]) => documents.get(id))),
      (docs) => docs.every((d) => !!d.file_text),
      TEXT_TIMEOUT_MS,
    ).catch(() => Promise.all(pending.map(([, id]) => documents.get(id))));
    const texts = new Map<Variant, string>(
      pending.map(([variant], i) => [variant, extracted[i]?.file_text ?? '']),
    );

    for (const group of groups) {
      console.log(`\n=== ${group.title} ===`);
      const fields = new Set(group.variants.flatMap((v) => (readings.get(v) ?? []).flatMap(Object.keys)));
      for (const field of fields) {
        const seen = group.variants.map((v) => [
          v.label,
          [...new Set((readings.get(v) ?? []).map((r) => r[field] ?? '—'))],
        ] as const);
        const same =
          seen.length > 1 &&
          seen.every(([, vals]) => vals.length === 1 && vals[0] === seen[0]![1][0]);
        const shown = seen.map(([label, vals]) => `${label}: ${vals.join(' | ')}`).join('   ');
        console.log(`${seen.length > 1 ? (same ? '  same ' : '  DIFF ') : '       '}${field.padEnd(28)} ${shown}`);
      }

      const [first, second] = group.variants.map((v) => texts.get(v) ?? '');
      if (group.variants.length === 1) {
        console.log(`  text: ${first!.length} chars`);
        continue;
      }
      if (!first || !second) {
        console.log('  text: not extracted for both (is an embedding model configured?)');
        continue;
      }
      const a = identifiers(first);
      const b = identifiers(second);
      const onlyPhoto = [...a].filter((x) => !b.has(x));
      const onlyPdf = [...b].filter((x) => !a.has(x));
      console.log(
        `  text: photo ${first.length} chars, pdf ${second.length} chars, ` +
          `${Math.round(wordOverlap(first, second) * 100)}% words shared`,
      );
      console.log(`  identifiers read only from the photo: ${onlyPhoto.join(', ') || 'none'}`);
      console.log(`  identifiers read only from the pdf:   ${onlyPdf.join(', ') || 'none'}`);
    }
  } finally {
    if (args.keep) {
      console.error(`\nKept ${created.length} documents tagged "fidelity-check".`);
    } else {
      for (const id of created) await documents.record(id).delete().catch(() => undefined);
    }
  }
}

async function waitFor<T>(
  fetch: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fetch();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
