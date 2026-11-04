/**
 * The Receipts page: two tabs over the two kinds of receipt worth keeping.
 *
 * Medical receipts are held against a future HSA withdrawal; charitable ones
 * against a tax return. They share a shape — a merchant, a date, an amount, a
 * scan of the paper — and almost nothing else, so they get one page and two
 * tabs rather than one merged list nobody asked for.
 *
 * The selected tab lives in the URL (`?tab=charitable`) rather than in state
 * alone, so a document that was mirrored into a donation can deep-link to the
 * tab holding it, and a reload doesn't bounce you back to Medical.
 *
 * The shell owns only "the reader asked to add something on this tab" — the
 * header button and the phone FAB. What that means, and the form it opens, is
 * the tab's business.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { MedicalTab } from '../medical/components/MedicalTab';
import { CharitableTab } from '../charitable/components/CharitableTab';

type ReceiptsTab = 'medical' | 'charitable';

const TABS: { id: ReceiptsTab; label: string }[] = [
  { id: 'medical', label: 'Medical' },
  { id: 'charitable', label: 'Charitable' },
];

/** Query-param name for the selected tab. */
const TAB_PARAM = 'tab';

const SUBTITLE: Record<ReceiptsTab, string> = {
  medical: 'Medical expenses kept for a tax-free HSA withdrawal',
  charitable: 'Donations kept for the year-end deduction',
};

/** Per-tab test ids, kept stable: the medical one predates the charitable tab. */
const ADD_TEST_ID: Record<ReceiptsTab, string> = {
  medical: 'add-hsa-receipt-button',
  charitable: 'add-charitable-receipt-button',
};

export function ReceiptsHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);

  // Anything unrecognized reads as the default tab, so a stale or hand-edited
  // link lands somewhere sensible instead of on a blank page.
  const tab: ReceiptsTab =
    searchParams.get(TAB_PARAM) === 'charitable' ? 'charitable' : 'medical';

  const selectTab = (next: ReceiptsTab) => {
    // Mutate a copy so other params survive the switch — except `year`, which
    // belongs to the charitable tab and would be meaningless carried back.
    const params = new URLSearchParams(searchParams);
    if (next === 'medical') {
      params.delete(TAB_PARAM);
      params.delete('year');
    } else {
      params.set(TAB_PARAM, next);
    }
    setSearchParams(params, { replace: true });
    setAddOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        subtitle={SUBTITLE[tab]}
        actions={
          <Button data-testid={ADD_TEST_ID[tab]} onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add receipt
          </Button>
        }
      />

      <div className="border-b border-gray-200" role="tablist" data-testid="receipts-tabs">
        <nav className="-mb-px flex gap-6">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => selectTab(id)}
              data-testid={`receipts-tab-${id}`}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-accent-terracotta text-accent-terracotta'
                  : 'border-transparent text-text-muted hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'medical' ? (
        <MedicalTab
          addOpen={addOpen}
          onOpenAdd={() => setAddOpen(true)}
          onCloseAdd={() => setAddOpen(false)}
        />
      ) : (
        <CharitableTab
          addOpen={addOpen}
          onOpenAdd={() => setAddOpen(true)}
          onCloseAdd={() => setAddOpen(false)}
        />
      )}

      {/* Mobile quick-add: a thumb-reachable floating action button. */}
      <button
        onClick={() => setAddOpen(true)}
        aria-label="Add receipt"
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent-terracotta text-white shadow-lg transition-colors hover:bg-accent-terracotta-hover md:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
}
