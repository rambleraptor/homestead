/**
 * The card every tool call on a resource gets when its app declares no chat
 * card for the action: the app's icon, what the call did (or is doing, or
 * couldn't do), the record's title, and the fields people would read as
 * label/value rows. A `list` shows a count and the first few titles. When the
 * app declares a record card for the resource, that stands in for the title
 * and rows once the record is known.
 *
 * It reads only the part's input and the executor's result, both already
 * shaped for the model (secrets dropped, large outputs capped), and never a
 * URL out of either.
 */

import { Suspense } from 'react';
import type { AppConfig, ChatCardProps, RecordCardType } from '@rambleraptor/homestead-core/apps/types';
import { AppIcon, getLazyComponent } from '@rambleraptor/homestead-core/apps/lazy';
import { recordTitle, resourceLabel, TITLE_FIELDS } from '@rambleraptor/homestead-core/resources/display';
import { Shimmer } from '@rambleraptor/homestead-core/shared/components/ai-elements/shimmer';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { cardRecordId, cardRows, humanizeName, listedRecords, type CardRow } from '../cards';

const LIST_PREVIEW = 5;

/** "Added todo", "Adding todo…", "Couldn't add todo": the line that says what happened. */
function headline(props: ChatCardProps): string {
  const { action, mode, resource, result } = props;
  const one = resourceLabel(resource).toLowerCase();
  const many = resourceLabel(resource, 'plural').toLowerCase();
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  if (action.startsWith(':')) {
    const verb = humanizeName(action.slice(1)).toLowerCase();
    const base = `${cap(one)}: ${verb}`;
    return mode === 'running' ? `${base}…` : mode === 'failed' ? `Couldn't ${verb} ${one}` : base;
  }
  if (action === 'list') {
    if (mode === 'done') {
      const records = listedRecords(result);
      const count = (result as { count?: unknown } | null)?.count;
      const n = typeof count === 'number' ? count : records?.length;
      if (n === undefined) return `Listed ${many}`;
      if (n === 0) return `No ${many} matched`;
      return `${n} ${n === 1 ? one : many}`;
    }
    return mode === 'failed' ? `Couldn't list ${many}` : `Listing ${many}…`;
  }
  const verbs: Record<'create' | 'read' | 'update' | 'delete', [string, string, string]> = {
    create: ['Add', 'Adding', 'Added'],
    read: ['Look up', 'Looking up', 'Looked up'],
    update: ['Change', 'Changing', 'Changed'],
    delete: ['Remove', 'Removing', 'Removed'],
  };
  const [plain, doing, did] = verbs[action as keyof typeof verbs];
  switch (mode) {
    case 'proposed':
      return `${plain} ${one}?`;
    case 'running':
      return `${doing} ${one}…`;
    case 'done':
      return `${did} ${one}`;
    case 'denied':
      return `${plain} ${one}: not done`;
    case 'failed':
      return `Couldn't ${plain.toLowerCase()} ${one}`;
  }
}

/** The record's title and the rows under it, for the action. */
function body(props: ChatCardProps): { title?: string; rows: CardRow[] } {
  const { action, resource, input, result, mode } = props;
  const fields = input.fields;
  switch (action) {
    case 'create':
    case 'update':
      return {
        title: recordTitle(result) ?? recordTitle(fields),
        rows: cardRows(resource, fields, TITLE_FIELDS),
      };
    case 'read':
      return {
        title: recordTitle(result),
        rows: mode === 'done' ? cardRows(resource, result, TITLE_FIELDS).slice(0, 4) : [],
      };
    case 'delete':
      return { title: recordTitle(fields) ?? recordTitle(result), rows: [] };
    case 'list':
      return { rows: [] };
    default:
      return { title: recordTitle(result), rows: cardRows(resource, input.body) };
  }
}

/** One listed record as a line: its title, else its first readable field, else its id. */
function listLine(resource: ChatCardProps['resource'], record: unknown): string {
  return (
    recordTitle(record) ??
    cardRows(resource, record)[0]?.value ??
    (typeof (record as { id?: unknown })?.id === 'string' ? (record as { id: string }).id : '…')
  );
}

export interface GenericActionCardProps extends ChatCardProps {
  /** The app that owns the resource, for its icon and record card. */
  app: AppConfig;
}

export function GenericActionCard(props: GenericActionCardProps) {
  const { app, resource, action, mode, input, result, error } = props;
  const icon = app.web?.icon;
  const { title, rows } = body(props);
  const records = action === 'list' && mode === 'done' ? listedRecords(result) : undefined;
  const line = headline(props);

  // The app's own rendering of the record, once there is one to show.
  const recordCard: RecordCardType | undefined = app.records?.[resource.singular];
  const id = mode === 'done' && action !== 'delete' && action !== 'list' ? cardRecordId(input, result) : undefined;
  const RecordCard = recordCard && id ? getLazyComponent(recordCard.component) : null;

  return (
    <div
      className="min-w-0 text-sm"
      data-testid={`chat-card-${resource.singular}`}
      data-action={action}
      data-mode={mode}
    >
      <div className="flex items-center gap-2">
        {icon && <AppIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />}
        {mode === 'running' ? (
          <Shimmer as="span" className="font-medium">
            {line}
          </Shimmer>
        ) : (
          <span className="font-medium" data-testid="chat-card-headline">
            {line}
          </span>
        )}
      </div>

      {RecordCard ? (
        <div className="mt-2">
          <Suspense fallback={<Title title={title} action={action} />}>
            <RecordCard id={id!} snapshot={result} size="card" />
          </Suspense>
        </div>
      ) : (
        <>
          <Title title={title} action={action} />
          {rows.length > 0 && (
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {rows.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      {records && records.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="chat-card-list">
          {records.slice(0, LIST_PREVIEW).map((record, i) => (
            <li key={(record as { id?: string })?.id ?? i} className="break-words">
              {listLine(resource, record)}
            </li>
          ))}
          {records.length > LIST_PREVIEW && (
            <li className="list-none text-muted-foreground">and {records.length - LIST_PREVIEW} more</li>
          )}
        </ul>
      )}

      {mode === 'failed' && (
        <p className="mt-1 text-destructive" role="alert" data-testid="chat-card-error">
          {error || 'The call failed.'}
        </p>
      )}
      {mode === 'denied' && <p className="mt-1 text-muted-foreground italic">You said no, so nothing changed.</p>}
    </div>
  );
}

function Title({ title, action }: { title?: string; action: ChatCardProps['action'] }) {
  if (!title) return null;
  return (
    <div
      className={cn('mt-1 break-words font-medium text-base', action === 'delete' && 'line-through text-muted-foreground')}
      data-testid="chat-card-title"
    >
      {title}
    </div>
  );
}
