/**
 * A form generated from a resource's schema. It renders a default control per
 * field and hands a plain data object to `onSubmit`. Per-field customization is
 * a sparse `fields` diff; unlisted fields render from defaults. State,
 * validation, and the submit flow come from {@link useSchemaForm} — including
 * the guarantee that `onSubmit` never fires while client-side validation fails.
 * See `./types` for the contract.
 */

import { useEffect, useMemo } from 'react';
import type { FieldDef } from '../../resources/types';
import { fieldLabel, orderFields, resolvedWidgetName } from './helpers';
import type { FieldConfig, FieldWidget, SchemaFormProps } from './types';
import { useSchemaForm } from './useSchemaForm';
import { BUILTIN_WIDGETS, FieldFrame, SELF_CHROMED, SELF_LABELED } from './widgets';

interface Entry {
  name: string;
  field: FieldDef;
  config?: FieldConfig;
}

interface Section {
  id: string;
  title?: string;
  entries: Entry[];
}

/**
 * Bucket the visible fields into ordered sections. With no `layout.groups` and
 * no field carrying a `group`, everything lands in a single untitled section
 * (the flat form). Otherwise ungrouped fields lead in an untitled section,
 * followed by each declared group in order; a `config.group` that names no
 * declared group falls back to the ungrouped bucket. Empty sections are dropped.
 */
function groupSections(
  visible: Entry[],
  groups: { id: string; title?: string }[] | undefined,
): Section[] {
  const hasGrouping = (groups?.length ?? 0) > 0 || visible.some((e) => e.config?.group);
  if (!hasGrouping) return [{ id: '__all__', entries: visible }];

  const declared = groups ?? [];
  const declaredIds = new Set(declared.map((g) => g.id));
  const DEFAULT = '__default__';
  const byId = new Map<string, Section>([[DEFAULT, { id: DEFAULT, entries: [] }]]);
  for (const g of declared) byId.set(g.id, { id: g.id, title: g.title, entries: [] });

  for (const entry of visible) {
    const gid = entry.config?.group && declaredIds.has(entry.config.group) ? entry.config.group : DEFAULT;
    byId.get(gid)!.entries.push(entry);
  }

  return [DEFAULT, ...declared.map((g) => g.id)]
    .map((id) => byId.get(id)!)
    .filter((section) => section.entries.length > 0);
}

export function SchemaForm<T = Record<string, unknown>>({
  resource,
  mode = 'create',
  fields = {},
  layout,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel,
  cancelLabel = 'Cancel',
  disableSubmitUntilValid = false,
  testId,
  submitTestId,
  cancelTestId,
  className = 'space-y-4',
}: SchemaFormProps<T>) {
  const schemaFields = resource.fields;
  const form = useSchemaForm<T>({ resource, mode, initialData, onSubmit, fields });

  // Dev-only: catch `fields` keys that don't match any schema field (typos).
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    for (const key of Object.keys(fields)) {
      if (!(key in schemaFields)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[SchemaForm] field override "${key}" does not match any field on ` +
            `resource "${resource.singular}" — it will be ignored.`,
        );
      }
    }
  }, [fields, schemaFields, resource.singular]);

  const busy = isSubmitting || form.isSubmitting;

  // The hook decides which fields are live (auto-hidden + `hidden` predicates
  // removed); the renderer only sorts and groups them.
  const orderedNames = useMemo(
    () => orderFields(form.visibleFields, fields, layout?.order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.visibleFields.join(','), layout?.order],
  );

  const columns = layout?.columns ?? 2;
  const gridClass = columns === 1 ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4';

  const renderField = ({ name, field, config }: Entry) => {
    const widgetName = resolvedWidgetName(field, config);
    const Widget: FieldWidget =
      typeof config?.widget === 'function'
        ? config.widget
        : BUILTIN_WIDGETS[widgetName as keyof typeof BUILTIN_WIDGETS];
    const id = config?.id ?? `sf-${resource.singular}-${name}`;
    const error = form.errors[name] || undefined;
    const required = config?.required ?? !!field.required;
    const selfChromed = typeof config?.widget !== 'function' && SELF_CHROMED.has(widgetName as never);
    const helpId = config?.help ? `${id}-help` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
    const control = (
      <Widget
        name={name}
        field={field}
        config={config}
        value={form.values[name]}
        onChange={(v) => form.setValue(name, v)}
        id={id}
        testId={config?.testId}
        required={required}
        disabled={busy}
        error={error}
        describedBy={describedBy}
        autoFocus={config?.autoFocus}
        form={{ values: form.values, setValue: form.setValue }}
      />
    );
    const colSpan = (config?.colSpan ?? 1) === 2 ? 'md:col-span-2' : undefined;
    return (
      <div key={name} className={colSpan}>
        {config?.bare || selfChromed ? (
          control
        ) : (
          <FieldFrame
            id={id}
            label={fieldLabel(name, field, config)}
            required={required}
            help={config?.help}
            error={error}
            helpId={helpId}
            errorId={errorId}
            hideLabel={SELF_LABELED.has(widgetName as never)}
          >
            {control}
          </FieldFrame>
        )}
      </div>
    );
  };

  const visibleEntries: Entry[] = orderedNames.map((name) => ({
    name,
    field: schemaFields[name]!,
    config: fields[name],
  }));
  const sections = groupSections(visibleEntries, layout?.groups);

  return (
    <form onSubmit={form.handleSubmit} data-testid={testId} className={className}>
      {form.formError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{form.formError}</p>
        </div>
      )}

      {sections.map((section) =>
        section.title ? (
          <fieldset key={section.id} className="min-w-0">
            <legend className="text-sm font-semibold text-brand-navy mb-2">
              {section.title}
            </legend>
            <div className={gridClass}>{section.entries.map(renderField)}</div>
          </fieldset>
        ) : (
          <div key={section.id} className={gridClass}>
            {section.entries.map(renderField)}
          </div>
        ),
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid={cancelTestId}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || (disableSubmitUntilValid && !form.isValid)}
          data-testid={submitTestId}
          className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {busy ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel ?? (mode === 'edit' ? 'Save' : 'Create')
          )}
        </button>
      </div>
    </form>
  );
}
