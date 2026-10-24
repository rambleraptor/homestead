/**
 * What kind of file some bytes are.
 *
 * An upload's own `Content-Type` is whatever the sender claims, so the formats
 * we can recognize from their leading bytes are decided by those bytes. Shared
 * by the engine (which records the type of each file stored by id) and the
 * document indexer (which picks how to show a file to the model). Pure
 * functions: safe on the server and in the browser.
 */

/** Magic-number → media type, for the formats the platform recognizes. */
export function sniffMediaType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return 'application/pdf'; // %PDF
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'image/jpeg';
  }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'image/png';
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  ) {
    return 'image/webp';
  }
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) {
    return 'image/gif'; // GIF8
  }
  // ISO base media: `ftyp` at offset 4, then the major brand.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!);
    if (brand === 'heic' || brand === 'heix' || brand === 'hevc' || brand === 'hevx') return 'image/heic';
    if (brand === 'mif1' || brand === 'msf1') return 'image/heif';
  }
  return null;
}

/** The types {@link sniffMediaType} can confirm, so a claim to be one must be confirmed. */
const RECOGNIZED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

/**
 * Whether a recorded type is one confirmed from the file's bytes. Only these
 * are safe to render inline as their type: anything else is the uploader's
 * claim, and a claimed `text/html` or `image/svg+xml` would run as script.
 */
export function isConfirmedMediaType(mediaType: string): boolean {
  return RECOGNIZED.has(bare(mediaType));
}

/** A media type's bare `type/subtype`, lowercased, without parameters. */
function bare(mediaType: string | undefined | null): string {
  return (mediaType ?? '').split(';')[0]!.trim().toLowerCase();
}

/**
 * The type to record for an upload. A recognizable format is named by its
 * bytes. Anything else keeps the type the sender declared — unless that
 * declaration names a recognizable format the bytes aren't, which is a
 * mislabelled (or disguised) file and is recorded as opaque bytes.
 */
export function resolveMediaType(bytes: Uint8Array, declared: string | undefined | null): string {
  const sniffed = sniffMediaType(bytes);
  if (sniffed) return sniffed;
  const claimed = bare(declared);
  if (!claimed || RECOGNIZED.has(claimed)) return 'application/octet-stream';
  return claimed;
}
