import { useState, type FormEvent } from 'react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { Input } from '@rambleraptor/homestead-core/shared/components/ui/input';
import { Label } from '@rambleraptor/homestead-core/shared/components/ui/label';
import { Textarea } from '@rambleraptor/homestead-core/shared/components/ui/textarea';
import { fromLocalInput, startedAt, toLocalInput } from '../baby';
import {
  useCreateBabyEvent,
  useDeleteBabyEvent,
  usePrimeBabyEvent,
  useUpdateBabyEvent,
} from '../hooks/useBabyEventMutations';
import type {
  Baby,
  BabyEvent,
  BabyEventFields,
  BottleContents,
  DiaperKind,
  FeedMethod,
  Side,
  VolumeUnit,
} from '../types';
import { ChoiceGroup, type Choice } from './ChoiceGroup';

const METHODS: Choice<FeedMethod>[] = [
  { value: 'breast', label: 'Breast' },
  { value: 'bottle', label: 'Bottle' },
];
const SIDE_CHOICES: Choice<Side>[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];
const UNITS: Choice<VolumeUnit>[] = [
  { value: 'oz', label: 'oz' },
  { value: 'ml', label: 'ml' },
];
const CONTENTS: Choice<BottleContents>[] = [
  { value: 'breast_milk', label: 'Breast milk' },
  { value: 'formula', label: 'Formula' },
];
const DIAPERS: Choice<DiaperKind>[] = [
  { value: 'wet', label: 'Wet' },
  { value: 'dirty', label: 'Dirty' },
  { value: 'both', label: 'Both' },
];
const TITLES = { feed: 'Feed', diaper: 'Diaper', sleep: 'Sleep' } as const;

export type EditorTarget =
  | { mode: 'edit'; event: BabyEvent }
  | { mode: 'new'; draft: BabyEventFields };

interface EventEditorProps {
  baby: Baby;
  target: EditorTarget;
  /** The unit a new amount starts in. */
  unit: VolumeUnit;
  onClose: () => void;
}

interface Errors {
  started?: string;
  ended?: string;
  amount?: string;
}

/** Fix an entry's time or details, delete it, or fill in a new one. */
export function EventEditor({ baby, target, unit, onClose }: EventEditorProps) {
  const toast = useToast();
  const createEvent = useCreateBabyEvent();
  const updateEvent = useUpdateBabyEvent();
  const deleteEvent = useDeleteBabyEvent();
  const prime = usePrimeBabyEvent();

  const initial: BabyEventFields = target.mode === 'edit' ? target.event : target.draft;
  const kind = initial.kind;
  const [started, setStarted] = useState(() =>
    toLocalInput(
      target.mode === 'edit' ? startedAt(target.event) : (initial.started_at ?? new Date().toISOString()),
    ),
  );
  const [ended, setEnded] = useState(() => (initial.ended_at ? toLocalInput(initial.ended_at) : ''));
  const [method, setMethod] = useState<FeedMethod | undefined>(initial.feed_method ?? undefined);
  const [side, setSide] = useState<Side | undefined>(initial.side ?? undefined);
  const [amount, setAmount] = useState(typeof initial.amount === 'number' ? String(initial.amount) : '');
  const [amountUnit, setAmountUnit] = useState<VolumeUnit>(initial.amount_unit ?? unit);
  const [contents, setContents] = useState<BottleContents | undefined>(initial.contents ?? undefined);
  const [diaper, setDiaper] = useState<DiaperKind | undefined>(initial.diaper ?? undefined);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const hasEnd = kind === 'sleep' || (kind === 'feed' && method === 'breast');
  const saving = createEvent.isPending || updateEvent.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const startedIso = fromLocalInput(started);
    if (!startedIso) next.started = 'Enter when it happened.';
    const endedIso = hasEnd ? fromLocalInput(ended) : undefined;
    if (hasEnd && ended && !endedIso) next.ended = 'Enter a valid time, or leave it blank.';
    if (startedIso && endedIso && endedIso <= startedIso) next.ended = 'Must be after the start.';
    const bottle = kind === 'feed' && method === 'bottle';
    const amountValue = amount.trim() === '' ? undefined : Number(amount);
    if (bottle && amountValue !== undefined && !(amountValue > 0)) {
      next.amount = 'Enter an amount above zero, or leave it blank.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !startedIso) return;

    // `null` clears a field on an update; a create simply leaves it out.
    const data: BabyEventFields = {
      kind,
      started_at: startedIso,
      notes: notes.trim() || null,
      ended_at: endedIso ?? null,
    };
    if (kind === 'feed') {
      data.feed_method = method ?? null;
      data.side = method === 'breast' ? (side ?? null) : null;
      data.amount = bottle ? (amountValue ?? null) : null;
      data.amount_unit = bottle && amountValue !== undefined ? amountUnit : null;
      data.contents = bottle ? (contents ?? null) : null;
    }
    if (kind === 'diaper') data.diaper = diaper ?? null;

    try {
      if (target.mode === 'edit') {
        prime(target.event);
        await updateEvent.mutateAsync({ id: target.event.id, data });
      } else {
        const fields = Object.fromEntries(
          Object.entries(data).filter(([, value]) => value !== null),
        ) as unknown as BabyEventFields;
        await createEvent.mutateAsync({ ...fields, baby: baby.id });
      }
      onClose();
    } catch {
      // The mutation's toast reports it; the form stays open.
    }
  };

  const remove = () => {
    if (target.mode !== 'edit') return;
    const { id, path: _path, create_time: _c, update_time: _u, created_by: _by, ...fields } = target.event;
    void _path;
    void _c;
    void _u;
    void _by;
    prime(target.event);
    deleteEvent.mutate(id);
    toast.undo('Entry deleted', () => createEvent.mutate({ ...fields, recordId: id }));
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={target.mode === 'edit' ? `Edit ${TITLES[kind].toLowerCase()}` : TITLES[kind]}>
      <form onSubmit={submit} className="space-y-4" data-testid="baby-event-editor" noValidate>
        {kind === 'feed' && (
          <ChoiceGroup label="How" value={method} choices={METHODS} onChange={setMethod} testId="baby-event-method" />
        )}
        {kind === 'feed' && method === 'breast' && (
          <ChoiceGroup label="Side" value={side} choices={SIDE_CHOICES} onChange={setSide} testId="baby-event-side" />
        )}
        {kind === 'feed' && method === 'bottle' && (
          <>
            <div>
              <Label htmlFor="baby-event-amount">Amount</Label>
              <div className="flex gap-2">
                <Input
                  id="baby-event-amount"
                  data-testid="baby-event-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!!errors.amount}
                  className="flex-1"
                />
                <div className="w-32">
                  <ChoiceGroupBare value={amountUnit} onChange={setAmountUnit} />
                </div>
              </div>
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600" role="alert" data-testid="baby-event-amount-error">
                  {errors.amount}
                </p>
              )}
            </div>
            <ChoiceGroup
              label="Contents"
              value={contents}
              choices={CONTENTS}
              onChange={setContents}
              testId="baby-event-contents"
            />
          </>
        )}
        {kind === 'diaper' && (
          <ChoiceGroup label="Diaper" value={diaper} choices={DIAPERS} onChange={setDiaper} testId="baby-event-diaper" />
        )}

        <div>
          <Label htmlFor="baby-event-started">{hasEnd ? 'Started' : 'Time'}</Label>
          <Input
            id="baby-event-started"
            data-testid="baby-event-started"
            type="datetime-local"
            value={started}
            onChange={(e) => setStarted(e.target.value)}
            aria-invalid={!!errors.started}
          />
          {errors.started && (
            <p className="mt-1 text-sm text-red-600" role="alert" data-testid="baby-event-started-error">
              {errors.started}
            </p>
          )}
        </div>
        {hasEnd && (
          <div>
            <Label htmlFor="baby-event-ended">Ended</Label>
            <Input
              id="baby-event-ended"
              data-testid="baby-event-ended"
              type="datetime-local"
              value={ended}
              onChange={(e) => setEnded(e.target.value)}
              aria-invalid={!!errors.ended}
            />
            {errors.ended ? (
              <p className="mt-1 text-sm text-red-600" role="alert" data-testid="baby-event-ended-error">
                {errors.ended}
              </p>
            ) : (
              kind === 'sleep' && <p className="mt-1 text-xs text-text-muted">Blank means still asleep.</p>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="baby-event-notes">Notes</Label>
          <Textarea
            id="baby-event-notes"
            data-testid="baby-event-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex items-center gap-2">
          {target.mode === 'edit' && (
            <Button type="button" variant="destructive" onClick={remove} data-testid="baby-event-delete">
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} className="ml-auto">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} data-testid="baby-event-save">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The unit switch beside the amount: the same buttons, without a heading. */
function ChoiceGroupBare({
  value,
  onChange,
}: {
  value: VolumeUnit;
  onChange: (unit: VolumeUnit) => void;
}) {
  return (
    <div role="group" aria-label="Unit" className="flex gap-1">
      {UNITS.map((u) => (
        <button
          key={u.value}
          type="button"
          aria-pressed={value === u.value}
          data-testid={`baby-event-unit-${u.value}`}
          onClick={() => onChange(u.value)}
          className={
            value === u.value
              ? 'h-9 flex-1 rounded-lg border border-brand-navy bg-brand-navy text-sm font-medium text-white'
              : 'h-9 flex-1 rounded-lg border border-gray-200 bg-surface-white text-sm font-medium text-text-main'
          }
        >
          {u.label}
        </button>
      ))}
    </div>
  );
}
