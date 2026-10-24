/**
 * Groceries Actions Menu
 *
 * The page's occasional tasks — managing stores, nudging the household,
 * importing a photographed list, starting over — gathered behind one ⋯
 * button. On a phone four labelled buttons wrapped onto two rows and pushed
 * the list down; shopping is add-and-tick, so the header keeps only the
 * title and this trigger. Same Radix popover menu as the people app's cards.
 */

import { useState } from 'react';
import { Popover } from 'radix-ui';
import {
  Bell,
  Image as ImageIcon,
  ListRestart,
  Loader2,
  MoreHorizontal,
  Store as StoreIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface GroceriesActionsMenuProps {
  onManageStores: () => void;
  onNotify: () => void;
  onUploadList: () => void;
  onNewList: () => void;
  /** The list has items, so "New List" has something to clear. */
  hasItems: boolean;
  isNotifying: boolean;
  isBulkUpdating: boolean;
  isOffline: boolean;
}

const menuItemClass =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-body ' +
  'text-brand-navy hover:bg-bg-pearl transition-colors ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent';

export function GroceriesActionsMenu({
  onManageStores,
  onNotify,
  onUploadList,
  onNewList,
  hasItems,
  isNotifying,
  isBulkUpdating,
  isOffline,
}: GroceriesActionsMenuProps) {
  const [open, setOpen] = useState(false);

  const menuAction = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  const offlineTitle = isOffline ? 'Available when online' : undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label="More actions"
        data-testid="groceries-menu-button"
        className={cn(
          'flex items-center justify-center w-10 h-10 bg-white hover:bg-bg-pearl text-brand-navy',
          'rounded-lg transition-colors shadow-sm border border-gray-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-terracotta',
        )}
      >
        {isNotifying ? (
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        ) : (
          <MoreHorizontal className="w-5 h-5" aria-hidden="true" />
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          role="menu"
          data-testid="groceries-menu"
          className="animate-menu-in z-50 w-52 rounded-xl border border-gray-200 bg-white p-1 shadow-md"
        >
          <MenuItem
            icon={StoreIcon}
            label="Stores"
            onClick={menuAction(onManageStores)}
            testId="manage-stores-button"
          />
          <MenuItem
            icon={Bell}
            label="Notify household"
            onClick={menuAction(onNotify)}
            disabled={isNotifying || isOffline}
            title={offlineTitle}
            testId="notify-grocery-button"
          />
          <MenuItem
            icon={ImageIcon}
            label="Upload list photo"
            onClick={menuAction(onUploadList)}
            disabled={isBulkUpdating || isOffline}
            title={offlineTitle}
            testId="upload-grocery-list-button"
          />
          {hasItems && (
            <MenuItem
              icon={ListRestart}
              label="New list"
              onClick={menuAction(onNewList)}
              disabled={isBulkUpdating || isOffline}
              title={offlineTitle}
              testId="new-grocery-list-button"
              className="text-red-600 hover:bg-red-50"
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testId: string;
  className?: string;
}

function MenuItem({ icon: Icon, label, onClick, disabled, title, testId, className }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className={cn(menuItemClass, className)}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
