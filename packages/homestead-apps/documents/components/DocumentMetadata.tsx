/**
 * Render a document's parsed metadata.
 *
 * Driven entirely by the doc type's YAML declaration — field order, labels, and
 * which fields exist all come from there. That's what lets an operator add a
 * document type without touching any code: no component knows what a 1099-INT is.
 *
 * The rows arrive in sequence rather than all at once. It's a short cascade in
 * declaration order — which for a tax form is box order — so the eye is walked
 * down the fields the way the form itself is laid out, and the page reads as
 * something the app assembled rather than a table that was always there.
 */

import { getDocType } from '../doc-types/registry';
import { readFacts, UNKNOWN_DOC_TYPE } from '../doc-types/docType';
import type { DocumentMetadata as Metadata } from '../types';

/**
 * Per-row stagger. Capped so a long form (a W-2 has eleven fields, a home
 * insurance policy more) still finishes promptly — past the cap the remaining
 * rows share the last delay and land together, which is fine: by then the
 * cascade has already been read.
 */
const STAGGER_MS = 28;
const MAX_STAGGERED_ROWS = 10;

/** The animation for the nth row: same everywhere, only the delay differs. */
function rowStyle(index: number) {
  return { animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_MS}ms` };
}

interface DocumentMetadataProps {
  metadata?: Metadata;
}

/**
 * Render a metadata value for display. Most fields are scalars; a doc type with
 * composite fields (a recipe's ingredient list, say) yields arrays/objects, so
 * flatten those to a readable line rather than `String()`-ing them to
 * `[object Object]`.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(formatValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(formatValue)
      .filter(Boolean)
      .join(' ');
  }
  return String(value);
}

export function DocumentMetadata({ metadata }: DocumentMetadataProps) {
  if (!metadata) return null;
  if (metadata.doc_type === UNKNOWN_DOC_TYPE) return <DocumentFacts metadata={metadata} />;

  const docType = getDocType(metadata.doc_type);
  if (!docType) {
    // The document was parsed against a doc type that has since been removed or
    // renamed. The values are still in the record, so show them rather than
    // hiding data — just without labels we no longer have.
    return (
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="document-metadata">
        {Object.entries(metadata)
          .filter(([key]) => key !== 'doc_type')
          .map(([key, value], index) => (
            <div key={key} className="animate-field-rise" style={rowStyle(index)}>
              <dt className="text-xs text-text-muted">{key}</dt>
              <dd className="text-sm text-brand-navy">{formatValue(value)}</dd>
            </div>
          ))}
      </dl>
    );
  }

  // Declaration order, not object order: the YAML lists boxes in form order.
  const rows = Object.entries(docType.fields)
    .map(([name, field]) => ({ name, label: field.label, value: metadata[name] }))
    .filter((row) => row.value !== undefined && row.value !== '');

  if (!rows.length) {
    return (
      <p className="text-sm text-text-muted" data-testid="document-metadata-empty">
        No fields could be read from this {docType.label}.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="document-metadata">
      {rows.map((row, index) => (
        <div
          key={row.name}
          className="animate-field-rise"
          style={rowStyle(index)}
          data-testid={`document-field-${row.name}`}
        >
          <dt className="text-xs text-text-muted">{row.label}</dt>
          <dd className="text-sm font-medium text-brand-navy">{formatValue(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * An unmatched document's free-form facts. Same layout as a type's fields, but
 * the labels come from the document itself rather than a declaration.
 */
function DocumentFacts({ metadata }: { metadata: Metadata }) {
  const facts = readFacts(metadata.facts);
  if (!facts.length) return null;

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="document-facts">
      {facts.map((fact, index) => (
        <div
          key={`${fact.label}-${index}`}
          className="animate-field-rise"
          style={rowStyle(index)}
          data-testid="document-fact"
        >
          <dt className="text-xs text-text-muted">{fact.label}</dt>
          <dd className="text-sm font-medium text-brand-navy">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
