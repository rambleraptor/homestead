/**
 * How the chat names its per-resource tools, shared by the server (which
 * registers them) and the SPA (which reads a tool part's type back to its
 * resource). Runtime-free, so either side can import it.
 */

import type { ResourceDefinition } from '../resources/types';

/** Tool names are snake_case, so kebab-case resource names lose their hyphens. */
export const snake = (s: string): string => s.replace(/-/g, '_');

/** The per-resource tool for a definition: one tool per plural (`gift_cards`). */
export function resourceToolName(def: Pick<ResourceDefinition, 'plural'>): string {
  return snake(def.plural);
}

/** The AI SDK's part type for a tool: `tool-<name>`. */
export const TOOL_PART_PREFIX = 'tool-';

/** `tool-gift_cards` → `gift_cards`; null for a part that isn't a tool. */
export function toolNameOf(partType: string): string | null {
  return partType.startsWith(TOOL_PART_PREFIX) ? partType.slice(TOOL_PART_PREFIX.length) : null;
}
