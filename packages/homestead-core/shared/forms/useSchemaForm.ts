/**
 * `useSchemaForm` — the headless engine behind SchemaForm.
 *
 * It owns everything that isn't rendering: field state seeded from the schema +
 * initialData, schema-derived (and optional cross-field) validation, the submit
 * flow (validate → build payload → onSubmit → map server errors), and the
 * blocking guarantee — `handleSubmit` never calls `onSubmit` while any
 * client-side validation fails.
 *
 * Consume it directly to build a fully custom-rendered form that still gets the
 * validation/submit machinery for free (bind controls with `register` /
 * `getFieldProps`); or let `SchemaForm` drive it for the generated layout.
 * `extraFields` lets a form manage controls that aren't on the resource schema.
 */

import { useMemo, useState, type FormEvent } from 'react';
import type { FieldDef, FieldType, ResourceDefinition } from '../../resources/types';
import { buildPayload as buildDefaultPayload, fieldLabel, initialValue, isAutoHidden } from './helpers';
import { deriveValidator, mapServerError } from './validation';
import { isSecretDescriptor } from '../../resources/secrets';
import type { FieldConfig } from './types';

/** A control the form manages that isn't a field on the resource schema. */
export interface ExtraFieldDef {
  type: FieldType;
  required?: boolean;
  default?: unknown;
  /** Custom validator; falls back to a required check when omitted. */
  validate?: (value: unknown, values: Record<string, unknown>) => string | null;
}

export interface UseSchemaFormOptions<T = Record<string, unknown>> {
  resource: ResourceDefinition;
  mode?: 'create' | 'edit';
  initialData?: Partial<Record<keyof T, unknown>> | null;
  onSubmit: (data: T) => void | Promise<void>;
  /** Per-field config; only the behavioral parts (`default`, `required`,
   *  `hidden`, `id`) are read here — presentation is the renderer's concern. */
  fields?: Partial<Record<string, FieldConfig>>;
  /** Controls not present on the resource schema (partner, addresses, …). */
  extraFields?: Record<string, ExtraFieldDef>;
  /** Cross-field validation, run on submit and folded into `isValid`. Return a
   *  `{ field: message }` map (`_form` for a form-level error), or null. */
  validate?: (values: Record<string, unknown>) => Record<string, string> | null;
  /** Override the default omit-blank-optionals payload builder. */
  buildPayload?: (values: Record<string, unknown>) => Record<string, unknown>;
}

export interface FieldBinding {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
  error?: string;
  required: boolean;
  id: string;
  describedBy?: string;
}

export interface NativeBinding {
  name: string;
  id: string;
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  onBlur: () => void;
  'aria-required'?: true;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface UseSchemaFormReturn<T = Record<string, unknown>> {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  formError: string | null;
  /** True when every current value passes validation (drives disable-until-valid). */
  isValid: boolean;
  /** True while `onSubmit` is in flight. */
  isSubmitting: boolean;
  isDirty: boolean;
  /** Visible field names (auto-hidden and `hidden`-predicate fields removed),
   *  in schema-then-extra declaration order. The renderer applies its own sort. */
  visibleFields: string[];

  setValue: (name: string, value: unknown) => void;
  setValues: (patch: Record<string, unknown>) => void;
  setError: (name: string, message: string | null) => void;
  reset: (data?: Partial<Record<keyof T, unknown>> | null) => void;
  handleSubmit: (e?: FormEvent) => Promise<void>;

  /** Value-based binding for a custom control (matches FieldWidgetProps). */
  getFieldProps: (name: string) => FieldBinding;
  /** DOM-event binding for a native input/select/textarea. */
  register: (name: string) => NativeBinding;
  field: (name: string) => { def: FieldDef; label: string; error?: string; required: boolean; visible: boolean };
}

const EXTRA_DEF = (ex: ExtraFieldDef): FieldDef => ({ type: ex.type, required: ex.required, default: ex.default });

export function useSchemaForm<T = Record<string, unknown>>(
  options: UseSchemaFormOptions<T>,
): UseSchemaFormReturn<T> {
  const { resource, initialData, onSubmit, fields = {}, extraFields = {}, validate } = options;

  // name -> resolved FieldDef, for every field the form manages (schema fields
  // that aren't auto-hidden, plus the declared extras), in declaration order.
  const registry = useMemo(() => {
    const map = new Map<string, FieldDef>();
    for (const [name, def] of Object.entries(resource.fields)) {
      if (!isAutoHidden(def)) map.set(name, def);
    }
    for (const [name, ex] of Object.entries(extraFields)) map.set(name, EXTRA_DEF(ex));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.fields, extraFields]);

  const seed = (data: Partial<Record<keyof T, unknown>> | null | undefined): Record<string, unknown> => {
    const init: Record<string, unknown> = {};
    for (const [name, def] of registry) {
      init[name] = initialValue(name, def, fields[name], data as Record<string, unknown> | null | undefined);
    }
    return init;
  };

  const [values, setValuesState] = useState<Record<string, unknown>>(() => seed(initialData));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [isDirty, setDirty] = useState(false);

  const configOf = (name: string) => fields[name];
  const defOf = (name: string) => registry.get(name);
  const requiredOf = (name: string) => configOf(name)?.required ?? !!defOf(name)?.required;
  const idOf = (name: string) => configOf(name)?.id ?? `sf-${resource.singular}-${name}`;

  const isHidden = (name: string) => {
    const h = configOf(name)?.hidden;
    return typeof h === 'function' ? h(values) : !!h;
  };
  const visibleFields = [...registry.keys()].filter((n) => !isHidden(n));

  const validateField = (name: string): string | null => {
    const ex = extraFields[name];
    if (ex?.validate) return ex.validate(values[name], values);
    const def = defOf(name);
    if (!def) return null;
    if (ex) {
      // A required extra field with no custom validator gets a basic empty check.
      const v = values[name];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
      return ex.required && empty ? `${fieldLabel(name, def, configOf(name))} is required` : null;
    }
    return deriveValidator(name, def, configOf(name))(values[name]);
  };

  const computeErrors = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const name of visibleFields) {
      const msg = validateField(name);
      if (msg) out[name] = msg;
    }
    const cross = validate?.(values);
    if (cross) for (const [k, v] of Object.entries(cross)) if (v) out[k] = v;
    return out;
  };

  const isValid = Object.keys(computeErrors()).length === 0;

  const setValue = (name: string, value: unknown) => {
    setValuesState((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
    setErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };
  const setValues = (patch: Record<string, unknown>) => {
    setValuesState((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };
  const setError = (name: string, message: string | null) =>
    setErrors((prev) => ({ ...prev, [name]: message ?? '' }));
  const reset = (data?: Partial<Record<keyof T, unknown>> | null) => {
    setValuesState(seed(data ?? initialData));
    setErrors({});
    setFormError(null);
    setDirty(false);
  };

  const describedBy = (name: string): string | undefined => {
    const id = idOf(name);
    const helpId = configOf(name)?.help ? `${id}-help` : undefined;
    const errorId = errors[name] ? `${id}-error` : undefined;
    return [helpId, errorId].filter(Boolean).join(' ') || undefined;
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault?.();
    setFormError(null);

    // The blocking guarantee: never call onSubmit while any validation fails.
    const nextErrors = computeErrors();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const payload = options.buildPayload
        ? options.buildPayload(values)
        : buildDefaultPayload(
            visibleFields.map((name) => ({ name, field: defOf(name)!, config: configOf(name) })),
            values,
          );
      await onSubmit(payload as T);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      const fieldErrors = mapServerError(message, visibleFields);
      if (Object.keys(fieldErrors).length > 0) setErrors(fieldErrors);
      else setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const getFieldProps = (name: string): FieldBinding => ({
    value: values[name],
    onChange: (value) => setValue(name, value),
    onBlur: () => {
      const msg = validateField(name);
      if (msg) setErrors((prev) => ({ ...prev, [name]: msg }));
    },
    error: errors[name] || undefined,
    required: requiredOf(name),
    id: idOf(name),
    describedBy: describedBy(name),
  });

  const register = (name: string): NativeBinding => ({
    name,
    id: idOf(name),
    // A stored secret's descriptor isn't text: a native box starts empty, and
    // stays the descriptor (unchanged) until someone types a replacement.
    value: isSecretDescriptor(values[name]) ? '' : ((values[name] as string | number | undefined) ?? ''),
    onChange: (event) => setValue(name, event.target.value),
    onBlur: () => {
      const msg = validateField(name);
      if (msg) setErrors((prev) => ({ ...prev, [name]: msg }));
    },
    'aria-required': requiredOf(name) || undefined,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': describedBy(name),
  });

  const field = (name: string) => {
    const def = defOf(name)!;
    return {
      def,
      label: fieldLabel(name, def, configOf(name)),
      error: errors[name] || undefined,
      required: requiredOf(name),
      visible: visibleFields.includes(name),
    };
  };

  return {
    values,
    errors,
    formError,
    isValid,
    isSubmitting,
    isDirty,
    visibleFields,
    setValue,
    setValues,
    setError,
    reset,
    handleSubmit,
    getFieldProps,
    register,
    field,
  };
}
