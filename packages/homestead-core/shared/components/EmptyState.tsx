/**
 * The shared empty state: what a screen or widget shows when it has nothing to
 * list yet.
 *
 * An empty list is the first thing a new household sees of every app, and the
 * worst version of it is a grey "No X yet." that reads as a dead end. This one
 * says what the screen is for, offers the action that fills it, and (when the
 * caller gives it a prompt) a quiet way to ask the assistant instead — the
 * link lands on the home with `?ask=<prompt>` ready to send.
 *
 * `compact` is the inside-a-widget size: a dashed card, smaller type, no
 * shadow. The icon pops in with `animate-reveal-pop` — a small reward for
 * arriving somewhere new, and the only motion on the page.
 */

import { isValidElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { Button } from './Button';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  testId?: string;
}

/** An action is a spec the component renders as a button, or a node of the caller's own. */
export type EmptyStateActionProp = EmptyStateAction | ReactNode;

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: EmptyStateActionProp;
  secondaryAction?: EmptyStateActionProp;
  /** Offered as an "Ask the assistant" link to the home, with this prompt filled in. */
  assistantPrompt?: string;
  /** The inside-a-widget size. */
  compact?: boolean;
  className?: string;
  'data-testid'?: string;
}

/** The home's address for a prompt the assistant should start with. */
export function assistantPromptPath(prompt: string): string {
  return `/dashboard?ask=${encodeURIComponent(prompt)}`;
}

function isActionSpec(action: EmptyStateActionProp): action is EmptyStateAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    !Array.isArray(action) &&
    !isValidElement(action) &&
    'label' in action &&
    'onClick' in action
  );
}

function renderAction(action: EmptyStateActionProp, variant: 'primary' | 'secondary') {
  if (action === undefined || action === null || action === false) return null;
  if (!isActionSpec(action)) return action;
  return (
    <Button variant={variant} onClick={action.onClick} data-testid={action.testId}>
      {action.label}
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  assistantPrompt,
  compact = false,
  className,
  'data-testid': testId = 'empty-state',
}: EmptyStateProps) {
  const primary = renderAction(action, 'primary');
  const secondary = renderAction(secondaryAction, 'secondary');
  const Title = compact ? 'p' : 'h2';

  return (
    <section
      className={cn(
        'flex flex-col items-center bg-surface-white text-center',
        compact
          ? 'gap-2 rounded-xl border border-dashed border-gray-200 px-4 py-6'
          : 'gap-3 rounded-2xl border border-gray-100 px-6 py-12 shadow-sm sm:py-14',
        className,
      )}
      data-testid={testId}
      data-compact={compact ? 'true' : undefined}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-accent-terracotta/10 text-accent-terracotta animate-reveal-pop',
          compact ? 'h-10 w-10' : 'h-14 w-14',
        )}
        aria-hidden="true"
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </span>

      <div className="max-w-sm">
        <Title
          className={cn(
            'font-display font-bold text-brand-navy',
            compact ? 'text-base' : 'text-xl',
          )}
        >
          {title}
        </Title>
        {description && (
          <p className={cn('mt-1 text-text-muted', compact ? 'text-xs' : 'text-sm')}>
            {description}
          </p>
        )}
      </div>

      {(primary || secondary) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {primary}
          {secondary}
        </div>
      )}

      {assistantPrompt && (
        <Link
          to={assistantPromptPath(assistantPrompt)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-md text-sm text-text-muted transition-colors hover:text-brand-navy"
          data-testid={`${testId}-ask`}
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Ask the assistant
        </Link>
      )}
    </section>
  );
}
