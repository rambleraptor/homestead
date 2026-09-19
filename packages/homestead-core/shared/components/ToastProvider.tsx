import { createContext, useContext, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@rambleraptor/homestead-core/shared/components/ui/sonner';
import { CelebrationToast } from '@rambleraptor/homestead-core/shared/components/CelebrationToast';
import type { ToastType } from '@rambleraptor/homestead-core/shared/types/toast';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';

export interface CelebrateOptions {
  /** A second, quieter line under the title. */
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  /**
   * Show an error toast. Accepts a plain string, or any thrown value — a
   * caught `AepbaseError` (or other error) is reduced to its standardized
   * user-facing message via {@link getAepErrorMessage}, so call sites can pass
   * the raw error: `catch (err) { toast.error(err); }`.
   */
  error: (error: unknown, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  /**
   * Confirm an action and offer to reverse it.
   *
   * The alternative to a confirmation dialog. A dialog taxes every single
   * delete to guard against the rare unintended one; an undo toast lets the
   * common case go through untouched and gives the rare one a way back. It
   * also tells the user something happened at all, which an instant silent
   * delete never does.
   *
   * The action still runs immediately — this is not a deferred delete. That
   * keeps the write durable the moment it's asked for: nothing is lost if the
   * tab closes or the app is navigated away from inside the undo window, which
   * is the failure mode a "cancel the pending delete" design quietly carries.
   * The tradeoff is that `onUndo` has to *restore* rather than *cancel*, so
   * reserve this for records that can be recreated without consequence —
   * nothing referring to them by id, no children to orphan. A cascading
   * delete should still ask first.
   *
   * Runs longer than a normal toast: the point is to still be there when the
   * user realises their mistake.
   */
  undo: (message: string, onUndo: () => void, duration?: number) => void;
  /**
   * Mark a small win — a list finished, a goal reached.
   *
   * Renders the shared {@link CelebrationToast} card instead of a plain
   * message, so every app's "you did it" moment looks the same and lands where
   * toasts live (the bottom of the screen) rather than over the content the
   * user is still working in. Any fanfare beyond the card — confetti, say —
   * stays with the caller; this is only the message.
   */
  celebrate: (title: string, options?: CelebrateOptions) => void;
}

/** Long enough to notice a mistake and reach the button, short of a nuisance. */
const UNDO_DURATION_MS = 8000;
/** Nothing to act on, so it only needs to hang around long enough to be read. */
const CELEBRATION_DURATION_MS = 4000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const options = duration ? { duration } : undefined;

      switch (type) {
        case 'success':
          sonnerToast.success(message, options);
          break;
        case 'error':
          sonnerToast.error(message, options);
          break;
        case 'info':
          sonnerToast.info(message, options);
          break;
        case 'warning':
          sonnerToast.warning(message, options);
          break;
      }
    },
    []
  );

  const success = useCallback(
    (message: string, duration?: number) => showToast('success', message, duration),
    [showToast]
  );

  const error = useCallback(
    (error: unknown, duration?: number) =>
      showToast(
        'error',
        typeof error === 'string' ? error : getAepErrorMessage(error),
        duration
      ),
    [showToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => showToast('info', message, duration),
    [showToast]
  );

  const warning = useCallback(
    (message: string, duration?: number) => showToast('warning', message, duration),
    [showToast]
  );

  const undo = useCallback(
    (message: string, onUndo: () => void, duration?: number) =>
      sonnerToast(message, {
        duration: duration ?? UNDO_DURATION_MS,
        action: { label: 'Undo', onClick: onUndo },
      }),
    []
  );

  const celebrate = useCallback(
    (title: string, options?: CelebrateOptions) =>
      sonnerToast.custom(
        () => <CelebrationToast title={title} description={options?.description} />,
        {
          duration: options?.duration ?? CELEBRATION_DURATION_MS,
          // sonner gives an unstyled toast no width of its own, so it would
          // shrink-wrap the card; fill the toaster like every other toast.
          className: 'w-full',
        }
      ),
    []
  );

  // Every member is a stable callback, so the context value can be too — a
  // consumer may list `toast` in an effect's deps without re-running it on
  // every render.
  const value = useMemo(
    () => ({ showToast, success, error, info, warning, undo, celebrate }),
    [showToast, success, error, info, warning, undo, celebrate],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
