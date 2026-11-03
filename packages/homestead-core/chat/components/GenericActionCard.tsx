/**
 * The card every tool call on a resource gets when its app declares no chat
 * card for the action: the app's icon, what the call did (or is doing, or
 * couldn't do), the record's title, and the fields people would read as
 * label/value rows. A `list` shows a count and the first few titles. When the
 * app declares a record card for the resource (`AppConfig.records`), that
 * stands in for the title and rows once the record is known — live, with the
 * app's own actions — and for each row of a list.
 *
 * It reads only the part's input and the executor's result, both already
 * shaped for the model (secrets dropped, large outputs capped), and never a
 * URL out of either.
 *
 * Apps writing their own chat card reuse the pieces: `cardHeadline` for the
 * same wording, `CardHeadline` for the same header row, and `GenericChatCard`
 * (in `./ChatCard`) for the modes they don't draw themselves.
 */

import type { ReactNode } from 'react';
import type { AppConfig, ChatCardProps } from '@rambleraptor/homestead-core/apps/types';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { recordTitle, resourceLabel, TITLE_FIELDS } from '@rambleraptor/homestead-core/resources/display';
import { Shimmer } from '@rambleraptor/homestead-core/shared/components/ai-elements/shimmer';
import { RecordCard, RecordTitleLine } from '@rambleraptor/homestead-core/records/components/RecordCard';
import { parentFromPath, recordCardOf, recordParent } from '@rambleraptor/homestead-core/records/owners';
import { cardRecordId, cardRows, humanizeName, listedRecords, type CardRow } from '../cards';

const LIST_PREVIEW = 5;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Added todo", "Adding todo…", "Couldn't add todo", "3 groceries": the line that says what happened. */
export function cardHeadline(props: Pick<ChatCardProps, 'action' | 'mode' | 'resource' | 'result'>): string {
  const { action, mode, resource, result } = props;
  const one = resourceLabel(resource).toLowerCase();
  const many = resourceLabel(resource, 'plural').toLowerCase();

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

/** A card's header row: an icon, and the line that says what happened (shimmering while it runs). */
export function CardHeadline({
  icon,
  running,
  children,
}: {
  icon?: ReactNode;
  running?: boolean;
  children: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      {running ? (
        <Shimmer as="span" className="font-medium">
          {children}
        </Shimmer>
      ) : (
        <span className="font-medium" data-testid="chat-card-headline">
          {children}
        </span>
      )}
    </div>
  );
}

/** The app's icon, sized for a card's header. */
export function CardAppIcon({ app }: { app: AppConfig }) {
  const icon = app.web?.icon;
  return icon ? <AppIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" /> : null;
}

/** Labeled rows, as the generic card shows a body. */
export function CardRows({ rows, label }: { rows: CardRow[]; label?: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-1">
      {label && <div className="text-muted-foreground text-xs">{label}</div>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
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

const idOf = (record: unknown): string | undefined => {
  const id = (record as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : undefined;
};

export interface GenericActionCardProps extends ChatCardProps {
  /** The app that owns the resource, for its icon and record card. */
  app: AppConfig;
  /**
   * Carry the card's test id and its action/mode attributes. Off when an app's
   * own card renders this one inside it, which already carries them.
   */
  marked?: boolean;
}

export function GenericActionCard(props: GenericActionCardProps) {
  const { app, resource, action, mode, input, result, error, marked = true } = props;
  const { title, rows } = body(props);
  const records = action === 'list' && mode === 'done' ? listedRecords(result) : undefined;
  const hasRecordCard = recordCardOf({ app, def: resource }) !== undefined;

  // The app's own rendering of the record, once there is one to show.
  const id = mode === 'done' && action !== 'delete' && action !== 'list' ? cardRecordId(input, result) : undefined;
  const showRecord = hasRecordCard && id !== undefined;

  return (
    <div
      className="min-w-0 text-sm"
      {...(marked
        ? { 'data-testid': `chat-card-${resource.singular}`, 'data-action': action, 'data-mode': mode }
        : {})}
    >
      <CardHeadline icon={<CardAppIcon app={app} />} running={mode === 'running'}>
        {cardHeadline(props)}
      </CardHeadline>

      {showRecord ? (
        <div className="mt-2">
          <RecordCard
            singular={resource.singular}
            id={id}
            snapshot={result}
            parent={recordParent(resource, input, result)}
            size="card"
          />
          {/* What this call changed, which the live record no longer says. */}
          {action === 'update' && <CardRows rows={rows} label="Changed" />}
        </div>
      ) : (
        <div className="mt-1">
          <RecordTitleLine snapshot={title ? { title } : undefined} struck={action === 'delete'} />
          <CardRows rows={rows} />
        </div>
      )}

      {records && records.length > 0 && (
        <ul
          className={hasRecordCard ? 'mt-2 space-y-1.5' : 'mt-1 list-disc space-y-0.5 pl-5'}
          data-testid="chat-card-list"
        >
          {records.slice(0, LIST_PREVIEW).map((record, i) => {
            const rowId = idOf(record);
            return (
              <li key={rowId ?? i} className="break-words">
                {hasRecordCard && rowId ? (
                  <RecordCard
                    singular={resource.singular}
                    id={rowId}
                    snapshot={record}
                    parent={parentFromPath((record as { path?: unknown }).path)}
                    size="row"
                  />
                ) : (
                  listLine(resource, record)
                )}
              </li>
            );
          })}
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
