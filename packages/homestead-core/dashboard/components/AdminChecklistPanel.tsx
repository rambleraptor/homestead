/**
 * Post-claim getting-started checklist for the household admin.
 *
 * Shown on the home to superusers, above a new conversation, while the
 * `dashboard.show_welcome_guide` setting is truthy — so it appears on the
 * admin's first login after claiming the instance, until dismissed.
 *
 * Each step reports its own done-state from live data (how many users exist,
 * whether an AI provider is configured), so the list checks itself off as the
 * admin works through it.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAiConfigured } from '@rambleraptor/homestead-core/chat/hooks/useAiConfigured';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useUserSetting } from '@rambleraptor/homestead-core/user-settings/hooks/useUserSetting';
import { useUsers } from '@rambleraptor/homestead-core/superuser/users/hooks/useUsers';

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Where the primary action for this step lives, when it's an in-app action. */
  to?: string;
  linkLabel?: string;
  /** Guidance shown under the label when the step isn't done in-app. */
  hint?: string;
}

export function AdminChecklistPanel() {
  const { value, setValue, isLoading, isSaving } = useUserSetting<boolean>(
    'dashboard',
    'show_welcome_guide',
  );
  const { data: users } = useUsers();
  const aiConfigured = useAiConfigured();

  const items = useMemo<ChecklistItem[]>(
    () => [
      {
        key: 'members',
        label: 'Add the rest of your household',
        // The admin's own account already exists, so "more than one user" means
        // at least one household member has been invited.
        done: (users?.length ?? 0) > 1,
        to: '/superuser/users',
        linkLabel: 'Manage users',
      },
      {
        key: 'ai',
        label: 'Turn on the AI assistant',
        done: aiConfigured === true,
        // Once it's on, the assistant is right here on the home.
        ...(aiConfigured
          ? {}
          : { to: '/superuser/credentials', linkLabel: 'Set the AI key' }),
      },
    ],
    [users, aiConfigured],
  );

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (isLoading || value === false) return null;

  return (
    <Card
      className="border-accent-terracotta/30 bg-accent-terracotta/5"
      data-testid="admin-checklist"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {allDone ? "You're all set" : 'Get your household set up'}
            </h2>
            <p className="text-sm text-gray-600">
              {allDone
                ? 'Nice work — everything below is done. Dismiss this whenever you like.'
                : 'A couple of quick steps to finish setting up this instance.'}
            </p>
          </div>
          <span
            className="shrink-0 text-xs font-medium text-gray-500"
            data-testid="admin-checklist-progress"
          >
            {doneCount} of {items.length} done
          </span>
        </div>

        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-start gap-3"
              data-testid={`checklist-item-${item.key}`}
            >
              {item.done ? (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-accent-terracotta"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="mt-0.5 h-5 w-5 shrink-0 text-gray-300"
                  aria-hidden="true"
                />
              )}
              <div className="space-y-1">
                <span
                  className={
                    item.done
                      ? 'text-sm font-medium text-gray-500 line-through'
                      : 'text-sm font-medium text-gray-900'
                  }
                >
                  {item.label}
                </span>
                {item.hint && !item.done && (
                  <p className="text-xs text-gray-500">{item.hint}</p>
                )}
                {item.to && (
                  <Link
                    to={item.to}
                    data-testid={`checklist-link-${item.key}`}
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-accent-terracotta hover:underline"
                  >
                    {item.linkLabel ?? 'Open'}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div>
          <Button
            size="sm"
            variant={allDone ? 'primary' : 'secondary'}
            onClick={() => void setValue(false)}
            disabled={isSaving}
            data-testid="admin-checklist-dismiss"
          >
            {allDone ? 'Done' : 'Dismiss'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
