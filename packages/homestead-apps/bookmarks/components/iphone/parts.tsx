/**
 * The pieces both "Save from iPhone" setups are built from: a numbered step, a
 * thing to tap, and one line of a Shortcuts action drawn the way Shortcuts
 * lays it out.
 */

import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/** What the shortcut is called, in the steps. */
export const SHORTCUT_NAME = 'Save to Homestead';

/** A long secret with its middle left out, for showing (never for copying). */
export function shortened(value: string, head = 18): string {
  return value.length > head + 10 ? `${value.slice(0, head)}…${value.slice(-4)}` : value;
}

/** The three taps that make the shortcut, the same whichever way it sends links. */
export function MakeTheShortcut() {
  return (
    <Step number={1} title="In Shortcuts">
      <ul className="space-y-1.5">
        <Tap>
          Tap <strong>+</strong> and name it “{SHORTCUT_NAME}”
        </Tap>
        <Tap>
          Tap <strong>ⓘ</strong> and turn on <strong>Show in Share Sheet</strong>
        </Tap>
        <Tap>
          Add the action <strong>Get Contents of URL</strong>
        </Tap>
      </ul>
    </Step>
  );
}

interface StepProps {
  number: number;
  title: string;
  /** A control beside the title. */
  aside?: ReactNode;
  children: ReactNode;
}

export function Step({ number, title, aside, children }: StepProps) {
  return (
    <section className="space-y-2" aria-label={`Step ${number}: ${title}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
          {number}
        </span>
        <h3 className="font-semibold text-brand-navy">{title}</h3>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function Tap({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export interface RowProps {
  /** The setting's name in the action, on the left. Empty for a further row of the one above. */
  label: string;
  /** A key within the setting (a header's name, a body field's). */
  name?: string;
  value: string;
  /** What to show instead of `value` when it is too long to read. */
  display?: string;
  /** Tapping the row copies `value`. */
  copyable?: boolean;
  /** A Shortcuts variable to pick, not text to type: drawn as a token. */
  variable?: boolean;
  testId?: string;
}

/**
 * One line of the action as Shortcuts lays it out. A copyable row is a button:
 * the whole line is the target, so it works with a thumb.
 */
export function Row({ label, name, value, display, copyable = false, variable = false, testId }: RowProps) {
  const toast = useToast();
  // The full value, selectable, once copying has failed: the only way left to take it.
  const [spelledOut, setSpelledOut] = useState(false);
  const what = name ?? label;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${what} copied`);
    } catch {
      setSpelledOut(true);
      toast.error('Couldn’t copy. Press and hold the text to copy it.');
    }
  };

  const content = (
    <>
      <span className="w-20 shrink-0 text-text-muted sm:w-28">{label}</span>
      {name && <span className="shrink-0 font-medium">{name}</span>}
      <span
        className={cn(
          'min-w-0 flex-1 text-right',
          spelledOut ? 'select-all break-all' : 'truncate',
          variable
            ? 'flex justify-end'
            : copyable
              ? 'font-mono text-xs text-brand-navy'
              : 'font-medium',
        )}
        data-testid={testId}
        data-value={value}
      >
        {variable ? (
          <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">{value}</span>
        ) : spelledOut ? (
          value
        ) : (
          display ?? value
        )}
      </span>
      {copyable && <Copy className="size-4 shrink-0 text-text-muted" aria-hidden />}
    </>
  );

  const layout = 'flex min-h-11 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm sm:gap-3';
  if (!copyable) return <div className={layout}>{content}</div>;
  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={`Copy ${what}`}
      className={cn(layout, 'hover:bg-gray-50 active:bg-gray-100')}
      data-testid={testId ? `${testId}-copy` : undefined}
    >
      {content}
    </button>
  );
}
