'use client';

/**
 * Omnibox filter context.
 *
 * Carries the parsed intent's filters into whatever `listComponent` the
 * adapter renders. The module's Home component calls `useOmniboxFilter()`
 * once to seed its internal filter state from context. When no omnibox is
 * active (normal module page), the hook is a no-op.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

interface OmniboxFilterContextValue {
  moduleId: string;
  filters: Record<string, unknown>;
}

const OmniboxFilterContext = createContext<OmniboxFilterContextValue | null>(
  null,
);

interface OmniboxFilterProviderProps {
  moduleId: string;
  filters: Record<string, unknown>;
  children: ReactNode;
}

export function OmniboxFilterProvider({
  moduleId,
  filters,
  children,
}: OmniboxFilterProviderProps) {
  return (
    <OmniboxFilterContext.Provider value={{ moduleId, filters }}>
      {children}
    </OmniboxFilterContext.Provider>
  );
}

/**
 * Called by module Home components to read omnibox filters.
 *
 * The callback runs once per `filters` identity. Outside of an omnibox
 * context the hook is inert — existing module pages (e.g. `/people`)
 * behave exactly as before.
 */
export function useOmniboxFilter(
  apply: (filters: Record<string, unknown>) => void,
): void {
  const ctx = useContext(OmniboxFilterContext);
  // Keep a stable reference to the callback so the main effect only
  // re-runs when filters change. Writing the ref happens in its own
  // effect so we don't touch `.current` during render.
  const applyRef = useRef(apply);
  useEffect(() => {
    applyRef.current = apply;
  });

  useEffect(() => {
    if (!ctx) return;
    applyRef.current(ctx.filters);
    // We intentionally depend on the filters object identity — callers
    // build it fresh per intent.
  }, [ctx]);
}

/** Test hook: read the context directly without effects. */
export function useOmniboxFilterContext(): OmniboxFilterContextValue | null {
  return useContext(OmniboxFilterContext);
}
