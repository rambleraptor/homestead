/**
 * Public types for the schema-driven form (`SchemaForm`).
 *
 * The form is driven by a resource's authoring `FieldDef` map: it renders a
 * default control per field and validates from the schema's constraint keywords
 * (required/enum/minimum/maxLength/pattern/…), which the engine also enforces.
 * Per-field customization is a **sparse diff** — the `fields` prop only carries
 * entries for fields you want to change; every other field renders from defaults.
 */

import type { ComponentType } from 'react';
import type { FieldDef, ResourceDefinition } from '../../resources/types';

/** Built-in control names. `widget` may also be a custom {@link FieldWidget}. */
export type WidgetName =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'file'
  | 'reference'
  | 'reference-multi'
  | 'tags'
  | 'secret';

/** Props every widget receives — built-in and custom alike. */
export interface FieldWidgetProps<V = unknown> {
  /** snake_case field name (the key in `resource.fields`). */
  name: string;
  /** The field's schema definition — carries type, enum, reference, constraints. */
  field: FieldDef;
  /** The resolved per-field config (presentation + overrides). */
  config?: FieldConfig;
  value: V;
  onChange: (value: V) => void;
  /** DOM id for the control (stable; label `htmlFor` points at it). */
  id: string;
  /** `data-testid` for the control, when the field config sets one. */
  testId?: string;
  required: boolean;
  disabled?: boolean;
  /** Validation message surfaced by the form, if any. */
  error?: string;
  /** Space-separated ids of the help/error text describing this control, for
   *  `aria-describedby`. Built-in widgets wire this automatically. */
  describedBy?: string;
  autoFocus?: boolean;
  /** Live access to sibling values, for dependent fields. */
  form: {
    values: Record<string, unknown>;
    setValue: (name: string, value: unknown) => void;
  };
}

export type FieldWidget<V = unknown> = ComponentType<FieldWidgetProps<V>>;

/**
 * Per-field override. Every property is optional — an entry only *adds*
 * information to a field that already exists in the schema.
 */
export interface FieldConfig {
  // presentation
  label?: string;
  placeholder?: string;
  help?: string;
  colSpan?: 1 | 2;
  order?: number;
  group?: string;
  /** Friendly labels for enum values, keyed by the raw value. */
  enumLabels?: Record<string, string>;
  autoFocus?: boolean;

  /** Visibility. `true` hides; a predicate hides based on live form values. */
  hidden?: boolean | ((values: Record<string, unknown>) => boolean);

  /** The control: a built-in widget name, or a custom component. */
  widget?: WidgetName | FieldWidget;

  /** Render the widget without the generated label/error chrome. */
  bare?: boolean;

  /** Force the field required (or not), overriding the schema. Useful when a
   *  field is optional in the schema but required in one particular form. */
  required?: boolean;

  /** Override the control's DOM id / test id (e.g. to satisfy existing e2e). */
  id?: string;
  testId?: string;

  /** Create-time default when neither `initialData` nor the schema supplies one. */
  default?: unknown;

  /** Arbitrary payload handed to a custom widget via `props.config.data`
   *  (e.g. the entity being edited, for a widget that resolves a stored file). */
  data?: unknown;

  // reference-widget customization (v1: plural + label field aren't yet
  // resolvable from the singular alone)
  collection?: string;
  labelField?: string;
  emptyMessage?: string;
}

export interface SchemaFormProps<T = Record<string, unknown>> {
  /** The resource whose `fields` drive the form (authoring definition). */
  resource: ResourceDefinition;
  /** `create` gates create-only defaults; `edit` is the update flow. */
  mode?: 'create' | 'edit';

  /** Sparse per-field overrides. One entry fully describes one field. */
  fields?: Partial<Record<string, FieldConfig>>;

  /** Form-level layout — genuinely not per-field. Fields are bucketed into
   *  `groups` (rendered as titled `<fieldset>` sections) by their
   *  `config.group`; ungrouped fields lead in an untitled section. */
  layout?: { groups?: { id: string; title?: string }[]; order?: string[]; columns?: 1 | 2 };

  /** Seed values. Typically the entity being edited — its field *value* types
   *  (e.g. a stored `front_image: string`) may differ from the form-data type,
   *  so keys are read loosely; file fields ignore the seed and start empty. */
  initialData?: Partial<Record<keyof T, unknown>> | null;
  onSubmit: (data: T) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;

  submitLabel?: string;
  cancelLabel?: string;

  /** When true, the submit button is disabled while any client-side validation
   *  fails. Independent of the hard guarantee that `onSubmit` never fires on an
   *  invalid form — this just reflects that state in the button. */
  disableSubmitUntilValid?: boolean;

  /** `data-testid` on the `<form>` element. */
  testId?: string;
  /** `data-testid` on the submit button. */
  submitTestId?: string;
  /** `data-testid` on the cancel button. */
  cancelTestId?: string;
  className?: string;
}
