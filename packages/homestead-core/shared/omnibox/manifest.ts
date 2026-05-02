/**
 * Build a JSON manifest describing every omnibox-enabled module. The
 * manifest is injected into the Gemini prompt so the LLM knows what
 * modules/filters/forms exist.
 *
 * The shape is intentionally flat + verbose so the LLM has maximum
 * context. We don't include runtime-only fields (render fns, hooks) —
 * those live only on the client-side adapter.
 */

import type { z } from 'zod';
import { getAllModules } from '@/modules/registry';
import type { HomeModule } from '@/modules/types';
import type { ModuleFilterDecl } from '@rambleraptor/homestead-core/shared/filters/types';
import type { OmniboxForm } from '@rambleraptor/homestead-core/shared/omnibox/types';

export interface ManifestForm {
  id: string;
  label: string;
  description: string;
  /** JSON-schema-ish sketch of `paramSchema`. */
  paramSchema: Record<string, unknown>;
}

export interface ManifestModule {
  moduleId: string;
  name: string;
  description: string;
  synonyms: string[];
  filters: ModuleFilterDecl[];
  forms: ManifestForm[];
}

/**
 * Best-effort JSON Schema sketch for a zod schema.
 *
 * Zod v4 exposes schema metadata (`_zod.def`). We walk the top-level shape
 * and report field names + simple types. The result is good enough for the
 * LLM — we don't need strict validity, we validate server- and client-side
 * separately via the real `paramSchema`.
 */
function sketchZodSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // zod doesn't expose a stable .shape for every schema kind, but for
  // plain object schemas it does. Guard defensively.
  const maybeShape = (schema as unknown as {
    shape?: Record<string, { _def?: { typeName?: string } }>;
    _def?: { shape?: () => Record<string, unknown>; typeName?: string };
  });

  const shape =
    maybeShape.shape ??
    (typeof maybeShape._def?.shape === 'function'
      ? maybeShape._def.shape()
      : undefined);

  if (!shape || typeof shape !== 'object') {
    return { type: 'object' };
  }

  const properties: Record<string, { type: string }> = {};
  for (const [key, value] of Object.entries(shape)) {
    const typeName = (value as { _def?: { typeName?: string } })?._def
      ?.typeName;
    let jsonType = 'string';
    if (typeName === 'ZodNumber') jsonType = 'number';
    else if (typeName === 'ZodBoolean') jsonType = 'boolean';
    else if (typeName === 'ZodArray') jsonType = 'array';
    else if (typeName === 'ZodObject') jsonType = 'object';
    properties[key] = { type: jsonType };
  }

  return { type: 'object', properties };
}

function formToManifest(form: OmniboxForm): ManifestForm {
  return {
    id: form.id,
    label: form.label,
    description: form.description,
    paramSchema: sketchZodSchema(form.paramSchema),
  };
}

function moduleToManifest(mod: HomeModule): ManifestModule | null {
  if (!mod.omnibox) return null;
  return {
    moduleId: mod.id,
    name: mod.name,
    description: mod.description,
    synonyms: mod.omnibox.synonyms,
    filters: mod.filters ?? [],
    forms: (mod.omnibox.forms ?? []).map(formToManifest),
  };
}

/**
 * Produce the manifest for every omnibox-enabled module in the registry.
 */
export function buildManifest(): ManifestModule[] {
  return getAllModules()
    .map(moduleToManifest)
    .filter((m): m is ManifestModule => m !== null);
}
