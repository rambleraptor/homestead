import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Baby as BabyIcon, Pencil } from 'lucide-react';
import { SyncStatus } from '@rambleraptor/homestead-core/shared/components/PendingSyncBadge';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { babyAge } from '../baby';
import { useBabies } from '../hooks/useBabies';
import { useBabyLog } from '../hooks/useBabyLog';
import { useVolumeUnit } from '../hooks/useVolumeUnit';
import { BABIES, BABY_EVENTS } from '../resources';
import type { BabyEvent, BabyEventFields } from '../types';
import { BabyForm } from './BabyForm';
import { EventEditor, type EditorTarget } from './EventEditor';
import { LogButtons } from './LogButtons';
import { StatusTiles } from './StatusTiles';
import { Timeline } from './Timeline';

const COLLECTIONS = [BABIES, BABY_EVENTS] as const;
/** `?log=` values the installed icon's shortcuts (and the widget) open with. */
const SHORTCUTS = ['wet', 'dirty', 'sleep', 'bottle'] as const;
type Shortcut = (typeof SHORTCUTS)[number];

export function BabyHome() {
  const babies = useBabies();
  const unit = useVolumeUnit();
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [babyForm, setBabyForm] = useState<'edit' | 'add' | null>(null);

  const list = babies.data ?? [];
  const baby = list.find((b) => b.id === params.get('baby')) ?? list[0];
  const log = useBabyLog(baby);

  const selectBaby = (id: string) =>
    setParams(
      (prev) => {
        prev.set('baby', id);
        return prev;
      },
      { replace: true },
    );

  /** A bottle starts from the last one: same amount, unit and contents. */
  const newBottle = (): BabyEventFields => {
    const last = log.events.find((e) => e.kind === 'feed' && e.feed_method === 'bottle');
    return {
      kind: 'feed',
      feed_method: 'bottle',
      amount: last?.amount ?? undefined,
      amount_unit: last?.amount_unit ?? unit,
      contents: last?.contents ?? undefined,
    };
  };
  const openBottle = () => setEditor({ mode: 'new', draft: newBottle() });

  // A shortcut logs once, when the data it needs is there, then leaves the
  // address so a reload doesn't log again.
  const shortcut = params.get('log');
  const shortcutDone = useRef(false);
  const ready = !!baby && !log.isLoading && !log.error;
  useEffect(() => {
    if (!shortcut || shortcutDone.current || !ready) return;
    shortcutDone.current = true;
    setParams(
      (prev) => {
        prev.delete('log');
        return prev;
      },
      { replace: true },
    );
    if (!SHORTCUTS.includes(shortcut as Shortcut)) return;
    if (shortcut === 'sleep') log.toggleSleep();
    else if (shortcut === 'bottle') openBottle();
    else log.logDiaper(shortcut as 'wet' | 'dirty');
    // Runs once per visit: `log` and `openBottle` are fresh each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcut, ready]);

  if (babies.isLoading) {
    return <SkeletonPage body="cards" label="Loading the baby log" data-testid="baby-loading" />;
  }
  if (babies.isError) {
    return (
      <QueryError
        error={babies.error}
        onRetry={() => void babies.refetch()}
        title="Couldn’t load the baby log"
        data-testid="baby-error"
      />
    );
  }

  if (!baby) {
    return (
      <div className="mx-auto max-w-md space-y-6" data-testid="baby-setup">
        <PageHeader
          title="Baby"
          subtitle="Log feeds, diapers and sleep with one tap, shared with everyone at home."
        />
        <div className="rounded-2xl border border-gray-200 bg-surface-white p-4">
          <div className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-brand-navy">
            <BabyIcon className="size-5" aria-hidden />
            Who are we logging for?
          </div>
          <BabyForm onSaved={(created) => selectBaby(created.id)} />
        </div>
      </div>
    );
  }

  const age = babyAge(baby.birth_date, new Date(log.now));

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="baby-home">
      <PageHeader
        title={<span data-testid="baby-name">{baby.name}</span>}
        subtitle={age ?? (baby.birth_date ? 'Arriving soon' : 'Add a birth date once the baby arrives')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setBabyForm('edit')} data-testid="baby-edit">
            <Pencil />
            Edit
          </Button>
        }
      />

      <SyncStatus collections={COLLECTIONS} />

      {list.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Baby" data-testid="baby-switcher">
          {list.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === baby.id}
              onClick={() => selectBaby(b.id)}
              data-testid="baby-switch"
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-medium',
                b.id === baby.id
                  ? 'border-brand-navy bg-brand-navy text-white'
                  : 'border-gray-200 bg-surface-white text-text-main',
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {log.error ? (
        <QueryError
          error={log.error}
          onRetry={() => void log.refetch()}
          title="Couldn’t load the log"
          data-testid="baby-events-error"
        />
      ) : (
        <>
          <StatusTiles log={log} />
          <LogButtons log={log} onBottle={openBottle} />
          <Timeline
            key={baby.id}
            baby={baby}
            log={log}
            unit={unit}
            onOpen={(event: BabyEvent) => setEditor({ mode: 'edit', event })}
          />
        </>
      )}

      {editor && (
        <EventEditor baby={baby} target={editor} unit={unit} onClose={() => setEditor(null)} />
      )}

      {babyForm && (
        <Modal
          isOpen
          onClose={() => setBabyForm(null)}
          title={babyForm === 'edit' ? `Edit ${baby.name}` : 'Add a baby'}
        >
          <BabyForm
            key={babyForm}
            baby={babyForm === 'edit' ? baby : undefined}
            onCancel={() => setBabyForm(null)}
            onSaved={(saved) => {
              selectBaby(saved.id);
              setBabyForm(null);
            }}
          />
          {babyForm === 'edit' && (
            <Button
              variant="link"
              className="mt-3 px-0"
              onClick={() => setBabyForm('add')}
              data-testid="baby-add-another"
            >
              Add another baby
            </Button>
          )}
        </Modal>
      )}
    </div>
  );
}
