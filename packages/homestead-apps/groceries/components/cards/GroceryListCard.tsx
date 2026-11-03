/**
 * The groceries app's chat card for a list (`AppChatConfig.cards`): the items a
 * reply looked at, grouped by store in the household's store order, each with
 * its checkbox — so "what do we need?" comes back as the list to shop from.
 * Rows read from the app's own list query (one request, kept live), and an
 * item that's since gone shows struck through.
 *
 * In a conversation with someone else in the household, it offers to share
 * the list: a follow-up in the same conversation, which the assistant answers
 * by messaging them (each message still waits for Approve).
 */

import type { ChatCardProps } from '@rambleraptor/homestead-core/apps/types';
import { listedRecords } from '@rambleraptor/homestead-core/chat/cards';
import { useChatCard } from '@rambleraptor/homestead-core/chat/cardContext';
import { GenericChatCard } from '@rambleraptor/homestead-core/chat/components/ChatCard';
import {
  CardAppIcon,
  CardHeadline,
  cardHeadline,
} from '@rambleraptor/homestead-core/chat/components/GenericActionCard';
import { useHousehold } from '@rambleraptor/homestead-core/household/useHousehold';
import { ownerOf } from '@rambleraptor/homestead-core/records/owners';
import { Button } from '@rambleraptor/homestead-core/shared/components/ui/button';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useGroceries } from '../../hooks/useGroceries';
import { useStores } from '../../hooks/useStores';
import { GroceryCardRow, storeIdOf, type CardGrocery } from './GroceryCardRow';

/** What the share button says in the conversation. */
export const SHARE_LIST_TEXT = 'Send the household this grocery list';

const NO_STORE = 'No store';

export function GroceryListCard(props: ChatCardProps) {
  const listed = props.mode === 'done' ? listedRecords(props.result) : undefined;
  // A list still running, or one whose stored output is only a preview.
  if (!listed) return <GenericChatCard {...props} />;
  const items = listed.filter((r): r is CardGrocery => typeof (r as CardGrocery | null)?.id === 'string');
  return <GroceryList props={props} listed={items} />;
}

interface Group {
  key: string;
  name: string;
  rows: { item: CardGrocery; deleted: boolean }[];
}

function GroceryList({ props, listed }: { props: ChatCardProps; listed: CardGrocery[] }) {
  const owner = ownerOf(props.resource.singular);
  const live = useGroceries();
  const stores = useStores();
  const byId = new Map((live.data ?? []).map((item) => [item.id, item]));

  // Stores in the household's order, then items with no store (or one that's gone).
  const groups = new Map<string, Group>();
  for (const store of stores.data ?? []) groups.set(store.id, { key: store.id, name: store.name, rows: [] });
  const loose: Group = { key: '', name: NO_STORE, rows: [] };
  for (const snapshot of listed) {
    const item = byId.get(snapshot.id) ?? snapshot;
    const deleted = live.data !== undefined && !byId.has(snapshot.id);
    const group = groups.get(storeIdOf(item.store) ?? '') ?? loose;
    group.rows.push({ item, deleted });
  }
  const shown = [...groups.values(), loose].filter((g) => g.rows.length > 0);
  for (const group of shown) {
    group.rows.sort((a, b) => Number(a.item.checked) - Number(b.item.checked) || a.item.name.localeCompare(b.item.name));
  }
  // One group with no store to name reads as a plain list.
  const named = shown.length > 1 || shown[0]?.name !== NO_STORE;

  return (
    <div data-testid="grocery-list-card">
      <CardHeadline icon={owner ? <CardAppIcon app={owner.app} /> : undefined}>{cardHeadline(props)}</CardHeadline>
      {shown.map((group) => (
        <section key={group.key} className="mt-2" data-testid="grocery-list-group" data-store={group.name}>
          {named && <h4 className="mb-1 font-medium text-muted-foreground text-xs uppercase">{group.name}</h4>}
          <ul className="space-y-1.5">
            {group.rows.map(({ item, deleted }) => (
              <li key={item.id}>
                <GroceryCardRow item={item} deleted={deleted} size="row" />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ShareList />
    </div>
  );
}

/** "Share with the household": only in a conversation, and only when there's someone to share with. */
function ShareList() {
  const chat = useChatCard();
  const household = useHousehold({ enabled: chat !== null });
  const toast = useToast();
  if (!chat || (household.data?.length ?? 0) < 2) return null;
  return (
    <div className="mt-3">
      <Button
        size="sm"
        variant="outline"
        disabled={chat.busy}
        onClick={() => void chat.send(SHARE_LIST_TEXT).catch((err: unknown) => toast.error(err))}
        data-testid="grocery-list-share"
      >
        Share with the household
      </Button>
    </div>
  );
}
