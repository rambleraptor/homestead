/**
 * Download a document's underlying file to the user's disk.
 *
 * The bytes are behind aepbase's authenticated `:download` POST method (a plain
 * `<a href>` can't carry the bearer token), so we fetch the blob, blob-URL it,
 * and click a throwaway anchor. Named after the document's title with an
 * extension recovered from its stored MIME type, since `:download` itself serves
 * everything as `application/octet-stream`.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { DOCUMENTS } from '../resources';
import type { Document } from '../types';

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** A safe download filename: "<title>.<ext>", falling back to the id. */
function downloadFilename(doc: Document): string {
  const base = (doc.title?.trim() || doc.id).replace(/[/\\?%*:|"<>]/g, '-');
  const ext = doc.mime_type ? EXT_BY_MIME[doc.mime_type] : undefined;
  return ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
}

export function useDownloadDocument() {
  return useMutation({
    mutationFn: async (doc: Document): Promise<void> => {
      const blob = await aepbase.download(DOCUMENTS, doc.id, 'file');
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFilename(doc);
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  });
}
