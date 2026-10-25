/**
 * Ask each widget what it would say in one line (`DashboardWidget.summary`).
 *
 * A summary is a lazily-imported *hook*, so it runs the widget's own data
 * hooks and shares their cache. Hooks can't be called from a loop, so each one
 * runs inside a tiny invisible component — a probe — that reports its result
 * up. The caller renders `probes` anywhere in its tree and reads `summaries`.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import type {
  LazySummaryHook,
  WidgetSummary,
} from '@rambleraptor/homestead-core/apps/types';
import type { RegisteredDashboardWidget } from '@rambleraptor/homestead-core/apps/registry';

/** `undefined`: not known yet; `null`: the widget has nothing to say. */
export type SummaryState = WidgetSummary | null | undefined;

interface ReporterProps {
  onSummary: (summary: SummaryState) => void;
}

const reporterCache = new WeakMap<object, LazyExoticComponent<ComponentType<ReporterProps>>>();

/** A component that calls the widget's summary hook and reports what it says. */
function reporterFor(loader: LazySummaryHook): LazyExoticComponent<ComponentType<ReporterProps>> {
  const cached = reporterCache.get(loader);
  if (cached) return cached;
  const Reporter = lazy(() =>
    loader().then((m) => {
      const useSummary = 'default' in m ? m.default : m;
      function SummaryReporter({ onSummary }: ReporterProps) {
        const summary = useSummary();
        const headline = summary?.headline;
        const urgent = summary?.urgent === true;
        const nothing = summary === null;
        useEffect(() => {
          onSummary(nothing ? null : headline === undefined ? undefined : { headline, urgent });
        }, [onSummary, headline, urgent, nothing]);
        return null;
      }
      return { default: SummaryReporter };
    }),
  );
  reporterCache.set(loader, Reporter);
  return Reporter;
}

const sameSummary = (a: SummaryState, b: SummaryState): boolean =>
  a === b || (!!a && !!b && a.headline === b.headline && a.urgent === b.urgent);

export function useWidgetSummaries(widgets: readonly RegisteredDashboardWidget[]): {
  summaries: ReadonlyMap<string, SummaryState>;
  probes: ReactNode;
} {
  const [summaries, setSummaries] = useState<ReadonlyMap<string, SummaryState>>(new Map());
  const report = useCallback((id: string, summary: SummaryState) => {
    setSummaries((prev) => {
      if (prev.has(id) && sameSummary(prev.get(id), summary)) return prev;
      const next = new Map(prev);
      next.set(id, summary);
      return next;
    });
  }, []);

  const probes = (
    <Suspense fallback={null}>
      {widgets
        .filter((w) => w.summary)
        .map((w) => (
          <Probe key={w.id} id={w.id} loader={w.summary!} report={report} />
        ))}
    </Suspense>
  );
  return { summaries, probes };
}

function Probe({
  id,
  loader,
  report,
}: {
  id: string;
  loader: LazySummaryHook;
  report: (id: string, summary: SummaryState) => void;
}) {
  const Reporter = reporterFor(loader);
  const onSummary = useCallback((summary: SummaryState) => report(id, summary), [id, report]);
  return <Reporter onSummary={onSummary} />;
}
