/**
 * Manually edit a document: its title, its type, and that type's fields.
 *
 * The type list and every field come from the doc-type registry, so this form
 * stays declaration-driven exactly like the read view — teaching the app a new
 * type via YAML makes it editable here with no code change.
 *
 * Switching type rebuilds the field set, carrying over any values whose field
 * name is shared between the old and new type (field names are shared columns).
 * Because the engine replaces the whole `metadata` object on save, the previous
 * type's leftover fields don't linger.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TagInput } from '@rambleraptor/homestead-core/shared/components/TagInput';
import { getDocType, getDocTypeFields } from '../doc-types/registry';
import { replaceMetadata, UNKNOWN_DOC_TYPE, type DocField } from '../doc-types/docType';
import { useCollections, toggleMembership } from '../hooks/useCollections';
import { DocTypeCombobox } from './DocTypeCombobox';
import { usePeople } from '../../people/hooks/usePeople';
import type { Document, DocumentMetadata } from '../types';

interface DocumentEditFormProps {
  document: Document;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (patch: Partial<Document>) => void;
}

/** Metadata values shown as strings while editing; parsed back on submit. */
type FieldValues = Record<string, string>;

/**
 * Only scalar fields are editable as text here. A doc type may also declare
 * composite `array`/`object` fields (a recipe's ingredient list); those aren't
 * text-editable, so the form skips them and preserves their stored value on save.
 */
function isScalarField(field: DocField): boolean {
  return field.type === 'string' || field.type === 'number';
}

function initialValues(docTypeId: string, metadata?: DocumentMetadata): FieldValues {
  const type = getDocType(docTypeId);
  if (!type) return {};
  const values: FieldValues = {};
  for (const [name, field] of Object.entries(type.fields)) {
    if (!isScalarField(field)) continue;
    const v = metadata?.[name];
    values[name] = v === undefined ? '' : String(v);
  }
  return values;
}

export function DocumentEditForm({
  document,
  isSaving,
  onCancel,
  onSubmit,
}: DocumentEditFormProps) {
  const { data: collections } = useCollections();
  const { data: people } = usePeople();
  const [title, setTitle] = useState(document.title ?? '');
  const [tags, setTags] = useState<string[]>(document.tags ?? []);
  const [memberOf, setMemberOf] = useState<string[]>(document.collections ?? []);
  const [linkedPeople, setLinkedPeople] = useState<string[]>(document.people ?? []);
  const [docTypeId, setDocTypeId] = useState(
    document.metadata?.doc_type ?? UNKNOWN_DOC_TYPE,
  );
  const [values, setValues] = useState<FieldValues>(() =>
    initialValues(docTypeId, document.metadata),
  );

  const selectedType = getDocType(docTypeId);

  const handleTypeChange = (nextId: string) => {
    setDocTypeId(nextId);
    // Carry over values whose field name exists in the new type; drop the rest.
    const next = getDocType(nextId);
    setValues((prev) => {
      const carried: FieldValues = {};
      if (next) {
        for (const [name, field] of Object.entries(next.fields)) {
          if (isScalarField(field)) carried[name] = prev[name] ?? '';
        }
      }
      return carried;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const metadata: DocumentMetadata = { doc_type: docTypeId };
    // `unknown` has fields too (its facts), carried through like a type's.
    const fields = getDocTypeFields(docTypeId);
    if (fields) {
      // Whether the stored composite values still belong to this record — only
      // when the type is unchanged (a type switch has no matching prior values).
      const sameType = docTypeId === document.metadata?.doc_type;
      for (const [name, field] of Object.entries(fields)) {
        if (!isScalarField(field)) {
          // Not editable here; carry the existing value through so a save (which
          // replaces the whole metadata object — see replaceMetadata) doesn't
          // drop it.
          const existing = sameType ? document.metadata?.[name] : undefined;
          if (existing !== undefined) metadata[name] = existing;
          continue;
        }
        const raw = values[name]?.trim() ?? '';
        if (raw === '') continue; // omit empty fields rather than storing ''
        metadata[name] = field.type === 'number' ? Number(raw) : raw;
      }
    }

    const matched = docTypeId !== UNKNOWN_DOC_TYPE;
    onSubmit({
      title: title.trim() || document.title || 'Untitled document',
      title_edited: true,
      tags,
      collections: memberOf,
      people: linkedPeople,
      metadata: replaceMetadata(document.metadata, metadata),
      // A human-set type is authoritative: matched → parsed, unknown → unmatched.
      parse_status: matched ? 'parsed' : 'unmatched',
      // A human-confirmed type is certain, so the AI's (possibly low) confidence
      // no longer applies — record full confidence for a match.
      ...(matched ? { confidence: 1 } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="document-edit-form">
      <div>
        <label htmlFor="doc-title" className="block text-xs font-medium text-brand-slate">
          Title
        </label>
        <input
          id="doc-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-200 bg-surface-white px-3 py-2 text-sm text-brand-slate focus:border-accent-terracotta focus:outline-none focus:ring-2 focus:ring-accent-terracotta/30"
          data-testid="document-edit-title"
        />
      </div>

      <div>
        <label htmlFor="doc-tags" className="block text-xs font-medium text-brand-slate">
          Tags
        </label>
        <div className="mt-1">
          <TagInput
            id="doc-tags"
            value={tags}
            onChange={setTags}
            disabled={isSaving}
            placeholder="Add a tag…"
            testId="document-edit-tags"
          />
        </div>
      </div>

      {collections && collections.length > 0 && (
        <div data-testid="document-edit-collections">
          <span className="block text-xs font-medium text-brand-slate">Collections</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {collections.map((c) => {
              const checked = memberOf.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent-terracotta/40 ${
                    checked
                      ? 'border-accent-terracotta bg-accent-terracotta text-white'
                      : 'border-gray-200 bg-surface-white text-brand-slate hover:bg-bg-pearl'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) =>
                      setMemberOf((prev) => toggleMembership(prev, c.id, e.target.checked))
                    }
                    data-testid={`document-edit-collection-${c.id}`}
                  />
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: c.color || '#4b5563' }}
                  />
                  {c.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {people && people.length > 0 && (
        <div data-testid="document-edit-people">
          <span className="block text-xs font-medium text-brand-slate">People</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {people.map((person) => {
              const checked = linkedPeople.includes(person.id);
              return (
                <label
                  key={person.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-within:ring-2 focus-within:ring-accent-terracotta/40 ${
                    checked
                      ? 'border-accent-terracotta bg-accent-terracotta text-white'
                      : 'border-gray-200 bg-surface-white text-brand-slate hover:bg-bg-pearl'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(e) =>
                      setLinkedPeople((prev) =>
                        toggleMembership(prev, person.id, e.target.checked),
                      )
                    }
                    data-testid={`document-edit-person-${person.id}`}
                  />
                  {person.name}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="doc-type" className="block text-xs font-medium text-brand-slate">
          Document type
        </label>
        <div className="mt-1">
          <DocTypeCombobox
            id="doc-type"
            value={docTypeId}
            onSelect={handleTypeChange}
            placeholder="No matching type"
            includeUnmatched
            block
            data-testid="document-edit-type"
          />
        </div>
      </div>

      {selectedType && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.entries(selectedType.fields)
            .filter(([, field]) => isScalarField(field))
            .map(([name, field]) => (
            <div key={name} data-testid={`document-edit-field-${name}`}>
              <label
                htmlFor={`doc-field-${name}`}
                className="block text-xs font-medium text-brand-slate"
              >
                {field.label}
              </label>
              <input
                id={`doc-field-${name}`}
                type={field.type === 'number' ? 'number' : 'text'}
                step={field.type === 'number' ? 'any' : undefined}
                value={values[name] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [name]: e.target.value }))
                }
                className="mt-1 block w-full rounded-lg border border-gray-200 bg-surface-white px-3 py-2 text-sm text-brand-slate focus:border-accent-terracotta focus:outline-none focus:ring-2 focus:ring-accent-terracotta/30"
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-terracotta px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-terracotta-hover disabled:opacity-50"
          data-testid="document-edit-save"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="text-sm text-text-muted transition-colors hover:text-brand-slate disabled:opacity-50"
          data-testid="document-edit-cancel"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
