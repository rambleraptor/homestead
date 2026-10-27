/**
 * "Homestead needs": the credentials something in Homestead declared it needs
 * (`GET /api/credential-slots`) — what each is for, the environment variable
 * that sets it instead, and where its value comes from now — with Set, Replace
 * and Clear. A slot's value is stored as the credential whose id is the slot
 * id, so nobody has to know what to name it.
 */

import { CheckCircle2, ExternalLink, Lock, TriangleAlert } from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import type { CredentialSlotStatus } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Where the value comes from, in words. */
function SourceLine({ slot }: { slot: CredentialSlotStatus }) {
  switch (slot.source) {
    case 'stored':
      return (
        <span className="flex items-center gap-1.5 text-green-700">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {['Set here', slot.stored?.hint, slot.stored?.set_time ? formatDate(slot.stored.set_time) : undefined]
            .filter(Boolean)
            .join(' · ')}
        </span>
      );
    case 'env':
      return (
        <span className="flex items-center gap-1.5 text-gray-700">
          <Lock className="h-4 w-4" aria-hidden />
          From the environment variable <code>{slot.env}</code>
        </span>
      );
    case 'config':
      return (
        <span className="flex items-center gap-1.5 text-gray-700">
          <Lock className="h-4 w-4" aria-hidden />
          Set in <code>homestead.config.ts</code>
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-1.5 text-amber-700">
          <TriangleAlert className="h-4 w-4" aria-hidden />
          Missing
        </span>
      );
  }
}

function HelpLine({ help }: { help: string }) {
  if (/^https:\/\//.test(help)) {
    return (
      <a
        href={help}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-sm text-accent-terracotta hover:underline"
      >
        Get a key <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    );
  }
  return <p className="text-sm text-gray-600">{help}</p>;
}

interface CredentialSlotsProps {
  slots: CredentialSlotStatus[] | undefined;
  isLoading: boolean;
  error: unknown;
  /** Saving needs a master key. */
  disabled: boolean;
  onSet: (slot: CredentialSlotStatus) => void;
  onClear: (slot: CredentialSlotStatus) => void;
}

export function CredentialSlots({ slots, isLoading, error, disabled, onSet, onClear }: CredentialSlotsProps) {
  if (isLoading) return null;
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Couldn’t load what Homestead needs: {getAepErrorMessage(error)}
      </div>
    );
  }
  if (!slots?.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="credential-slots-heading">
      <h2 id="credential-slots-heading" className="text-lg font-semibold text-gray-900">
        Homestead needs
      </h2>
      <ul className="space-y-3" data-testid="credential-slots">
        {slots.map((slot) => {
          // The config or env var wins: a stored value would do nothing.
          const locked = slot.source === 'env' || slot.source === 'config';
          return (
            <li key={slot.id}>
              <Card>
                <div className="flex items-start justify-between gap-4" data-testid={`slot-${slot.id}`}>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-gray-900">{slot.label}</h3>
                    <p className="text-xs text-gray-500">
                      Used by {slot.used_by}
                      {slot.env && (
                        <>
                          {' · '}
                          <code>{slot.env}</code>
                        </>
                      )}
                    </p>
                    {slot.description && <p className="text-sm text-gray-600">{slot.description}</p>}
                    <div className="text-sm" data-testid={`slot-status-${slot.id}`}>
                      <SourceLine slot={slot} />
                    </div>
                    {slot.overridden && (
                      <p className="text-xs text-gray-500" data-testid={`slot-overridden-${slot.id}`}>
                        A value is also stored here, but the{' '}
                        {slot.source === 'env' ? <code>{slot.env}</code> : 'config'} one wins.
                      </p>
                    )}
                    {slot.source === 'missing' && slot.help && <HelpLine help={slot.help} />}
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    {!locked && (
                      <Button
                        size="sm"
                        variant={slot.stored ? 'secondary' : 'primary'}
                        onClick={() => onSet(slot)}
                        disabled={disabled}
                        data-testid={`set-slot-${slot.id}`}
                      >
                        {slot.stored ? 'Replace' : 'Set'}
                      </Button>
                    )}
                    {slot.stored && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onClear(slot)}
                        data-testid={`clear-slot-${slot.id}`}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
