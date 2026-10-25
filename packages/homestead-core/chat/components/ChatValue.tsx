/**
 * Renders the typed values in a reply (see `../values`): the Markdown
 * renderer's link component, sending `homestead:<type>` links to that type's
 * renderer and every other link to Streamdown's own (which keeps its
 * link-safety prompt). Also the renderer settings that let such links through.
 */

import {
  Children,
  isValidElement,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  defaultComponents,
  defaultRehypePlugins,
  defaultUrlTransform,
  type StreamdownProps,
  type UrlTransform,
} from 'streamdown';
import type { ChatValueProps, LazyComponent } from '@rambleraptor/homestead-core/apps/types';
import { getAllApps } from '@rambleraptor/homestead-core/apps/registry';
import { getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { appValueTypes, VALUE_SCHEME, valueTypeOf } from '../values';

/** Core's renderers, by type (their descriptions: `CORE_VALUE_TYPES`). */
const CORE_RENDERERS: Readonly<Record<string, LazyComponent<ChatValueProps>>> = {
  phone: () => import('./values/PhoneValue'),
  email: () => import('./values/EmailValue'),
};

/** The renderer for a type, core's first; undefined for a type nobody declares. */
function rendererFor(type: string): LazyComponent<ChatValueProps> | undefined {
  return CORE_RENDERERS[type] ?? appValueTypes(getAllApps()).get(type)?.component;
}

/** The plain text of rendered link children (`**12** Oak St` → `12 Oak St`). */
function textOf(node: ReactNode): string {
  let text = '';
  Children.forEach(node, (child) => {
    if (typeof child === 'string' || typeof child === 'number') text += String(child);
    else if (isValidElement<{ children?: ReactNode }>(child)) text += textOf(child.props.children);
  });
  return text;
}

/** One typed value. An unknown type, or one still loading, shows as its text. */
export function ChatValue({ type, children }: { type: string; children: ReactNode }) {
  const text = textOf(children).trim();
  const loader = rendererFor(type);
  if (!loader || !text) return <>{children}</>;
  const Renderer = getLazyComponent(loader);
  return (
    <Suspense fallback={<>{children}</>}>
      <Renderer text={text} />
    </Suspense>
  );
}

const DefaultLink = defaultComponents.a as (props: ComponentProps<'a'>) => ReactNode;

/** The reply's link component: typed values to their renderers, the rest as usual. */
export function ReplyLink(props: ComponentProps<'a'>) {
  const { href, children } = props;
  if (href?.startsWith(`${VALUE_SCHEME}:`)) {
    const type = valueTypeOf(href);
    // A malformed type is still never a link: it shows as its text.
    return type ? <ChatValue type={type}>{children}</ChatValue> : <>{children}</>;
  }
  return <DefaultLink {...props} />;
}

/**
 * Streamdown's rehype plugins, with `homestead:` added to the sanitizer's
 * allowed link protocols — otherwise it strips the href before `ReplyLink`
 * sees it. Every other protocol keeps the default treatment.
 */
type RehypePlugins = NonNullable<StreamdownProps['rehypePlugins']>;
type Pluggable = RehypePlugins[number];

export const replyRehypePlugins: RehypePlugins = Object.values({
  ...defaultRehypePlugins,
  sanitize: (() => {
    const [plugin, schema] = defaultRehypePlugins.sanitize as [Pluggable, Record<string, unknown>];
    const protocols = (schema.protocols ?? {}) as Record<string, string[]>;
    return [
      plugin,
      { ...schema, protocols: { ...protocols, href: [...(protocols.href ?? []), VALUE_SCHEME] } },
    ];
  })(),
}) as RehypePlugins;

/** Keeps `homestead:` links as written; everything else goes through the default. */
export const replyUrlTransform: UrlTransform = (url, key, node) =>
  url.startsWith(`${VALUE_SCHEME}:`) ? url : defaultUrlTransform(url, key, node);
