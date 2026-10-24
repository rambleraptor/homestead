/**
 * App-level filter state.
 *
 * `AppFiltersProvider` owns the current filter values, exposes setters
 * to `<FilterBar>`, and memoizes the filtered list for the app's list
 * component via `useFilteredItems`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyFilters, deriveEnumOptionCounts, deriveEnumOptions } from './applyFilters';
import type { AppFilterDecl } from './types';

interface FiltersContextValue<T = unknown> {
  appId: string;
  decls: AppFilterDecl[];
  items: T[];
  values: Record<string, unknown>;
  setValue: (key: string, value: unknown) => void;
  reset: () => void;
  filteredItems: T[];
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

interface AppFiltersProviderProps<T> {
  appId: string;
  decls: AppFilterDecl[];
  items: T[];
  initialValues?: Record<string, unknown>;
  children: ReactNode;
}

export function AppFiltersProvider<T>({
  appId,
  decls,
  items,
  initialValues,
  children,
}: AppFiltersProviderProps<T>) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => initialValues ?? {},
  );

  // When the dispatcher routes a new intent to the same app, replace
  // the values. React's recommended pattern for deriving state from a
  // changing prop: setState during render, keyed on the prop identity —
  // avoids the cascading-render penalty of setState-in-effect.
  const [lastInitial, setLastInitial] = useState(initialValues);
  if (initialValues !== lastInitial) {
    setLastInitial(initialValues);
    setValues(initialValues ?? {});
  }

  const setValue = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setValues({});
  }, []);

  const filteredItems = useMemo(
    () => applyFilters(items, decls, values),
    [items, decls, values],
  );

  const ctxValue = useMemo<FiltersContextValue<T>>(
    () => ({
      appId,
      decls,
      items,
      values,
      setValue,
      reset,
      filteredItems,
    }),
    [appId, decls, items, values, setValue, reset, filteredItems],
  );

  return (
    <FiltersContext.Provider value={ctxValue as FiltersContextValue}>
      {children}
    </FiltersContext.Provider>
  );
}

function useFiltersContext(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) {
    throw new Error(
      'App filter hooks must be used inside <AppFiltersProvider>.',
    );
  }
  return ctx;
}

export function useAppFilterDecls(): AppFilterDecl[] {
  return useFiltersContext().decls;
}

export function useAppFilterValues(): {
  values: Record<string, unknown>;
  setValue: (key: string, value: unknown) => void;
  reset: () => void;
} {
  const { values, setValue, reset } = useFiltersContext();
  return { values, setValue, reset };
}

export function useFilteredItems<T>(): T[] {
  return useFiltersContext().filteredItems as T[];
}

export function useEnumOptions(key: string): string[] {
  const { decls, items } = useFiltersContext();
  return useMemo(() => {
    const decl = decls.find((d) => d.key === key);
    if (!decl) return [];
    return deriveEnumOptions(items, decl);
  }, [decls, items, key]);
}

export function useEnumOptionCounts(key: string): Array<{ value: string; count: number }> {
  const { decls, items } = useFiltersContext();
  return useMemo(() => {
    const decl = decls.find((d) => d.key === key);
    if (!decl) return [];
    return deriveEnumOptionCounts(items, decl);
  }, [decls, items, key]);
}
