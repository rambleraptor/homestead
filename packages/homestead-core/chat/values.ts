/**
 * Typed values in assistant replies: a value the model marks with its type,
 * `[12 Oak St, Springfield](homestead:address)`, which the chat renders with
 * that type's behavior (opening the person's map service, dialing a number).
 *
 * This module is the part both halves share, and it stays free of React and
 * of component imports so the server can load it for the system prompt. The
 * renderers live in `components/ChatValue.tsx`. Apps add types through
 * `AppConfig.chat.values`; core's own are below.
 *
 * The renderer only ever gets the value's text. Whatever link it makes is
 * built from that text and the person's settings, so a reply — which may echo
 * anything a document said — can mark a value but never choose a URL.
 */

import type { AppConfig, ChatValueType } from '../apps/types';
import { resolveResources } from '../apps/registry';

/** The link scheme that marks a typed value. */
export const VALUE_SCHEME = 'homestead';

/** A type name: lowercase, so the scheme's path reads the same everywhere. */
const TYPE_NAME = /^[a-z][a-z0-9-]*$/;

/** What the model is told about a type: everything but its renderer. */
export type ChatValueDescription = Omit<ChatValueType, 'component'>;

/** Core's types, always offered with the chat. Renderers: `components/ChatValue`. */
export const CORE_VALUE_TYPES: Readonly<Record<string, ChatValueDescription>> = {
  phone: { description: 'a phone number', example: '(555) 123-4567' },
  email: { description: 'an email address', example: 'jake@example.com' },
};

/** `homestead:address` → `'address'`; null for any other link. */
export function valueTypeOf(href: string | undefined): string | null {
  const prefix = `${VALUE_SCHEME}:`;
  if (!href?.startsWith(prefix)) return null;
  const type = href.slice(prefix.length);
  return TYPE_NAME.test(type) ? type : null;
}

/** A reply's text with its typed-value markup reduced to the values, for copying. */
export function plainReplyText(text: string): string {
  return text.replace(new RegExp(`\\[([^\\]]*)\\]\\(${VALUE_SCHEME}:[a-z0-9-]*\\)`, 'g'), '$1');
}

/**
 * Every app-declared type, in declaration order (nested apps included), with
 * the app that declares it. A name core or an earlier app already took is
 * skipped, as is a name that isn't lowercase. `offered` (resource singulars)
 * keeps only apps with at least one offered tool, as `appNotes` does.
 */
export function appValueTypes(
  apps: readonly AppConfig[],
  offered?: ReadonlySet<string>,
): Map<string, ChatValueType> {
  const types = new Map<string, ChatValueType>();
  const visit = (app: AppConfig): void => {
    const values = app.chat?.values ?? {};
    const reachable =
      !offered || resolveResources(app).some((def) => offered.has(def.singular));
    if (reachable) {
      for (const [name, type] of Object.entries(values)) {
        if (!TYPE_NAME.test(name) || name in CORE_VALUE_TYPES || types.has(name)) continue;
        types.set(name, type);
      }
    }
    for (const child of app.children ?? []) visit(child);
  };
  for (const app of apps) visit(app);
  return types;
}

/**
 * The types to tell the model about, one line each, core's first:
 * `- address: a postal address, e.g. [12 Oak St](homestead:address)`.
 */
export function valueTypeLines(
  apps: readonly AppConfig[],
  offered: ReadonlySet<string>,
): string[] {
  const all: [string, ChatValueDescription][] = [
    ...Object.entries(CORE_VALUE_TYPES),
    ...appValueTypes(apps, offered),
  ];
  return all.map(
    ([name, { description, example }]) =>
      `- ${name}: ${description}, e.g. [${example}](${VALUE_SCHEME}:${name})`,
  );
}
