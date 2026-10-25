/**
 * How a typed value looks in a reply: the value itself, with a small icon,
 * as a link. Apps' value renderers use it so every type reads alike.
 */

import type { LucideIcon } from 'lucide-react';

export interface ValueLinkProps {
  /** The type, for tests and styling hooks (`data-value-type`). */
  type: string;
  /** Where it goes. Built by the renderer from the value, never from the reply. */
  href: string;
  /** The value as written in the reply, shown as the link text. */
  text: string;
  icon: LucideIcon;
  /** Opens another site (a map), so it gets a new tab. */
  external?: boolean;
  /** What the link does, for screen readers: "Open in Google Maps". */
  label?: string;
}

export function ValueLink({ type, href, text, icon: Icon, external = false, label }: ValueLinkProps) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      title={label}
      aria-label={label ? `${text}. ${label}` : undefined}
      className="inline-flex items-baseline gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
      data-testid={`chat-value-${type}`}
      data-value-type={type}
    >
      <Icon className="size-3.5 shrink-0 self-center" aria-hidden />
      {text}
    </a>
  );
}
