'use client';

/**
 * Routes a parsed `OmniboxIntent` to the right inline rendering:
 *  - `list` → the module's Home component (via `OmniboxListView`).
 *  - `form` → the module's form (via `OmniboxFormView`).
 *
 * Never calls `router.push` — everything happens inline on `/search`.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Sparkles } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { getModuleById } from '@/modules/registry';
import type { OmniboxIntent } from '@rambleraptor/homestead-core/shared/omnibox/types';
import { OmniboxListView } from '@rambleraptor/homestead-core/shared/omnibox/OmniboxListView';
import { OmniboxFormView } from '@rambleraptor/homestead-core/shared/omnibox/OmniboxFormView';

interface OmniboxDispatcherProps {
  intent: OmniboxIntent | null;
  /** Shown in the inline banner above the rendered result. */
  rationale?: string;
  /** True when the parse endpoint fell back to keyword matching. */
  fallback?: boolean;
}

export function OmniboxDispatcher({
  intent,
  rationale,
  fallback,
}: OmniboxDispatcherProps) {
  // After a successful form submit, we want to flip to the list view for
  // the same module so the user sees the record they just created. We
  // track this by the intent identity itself — when the intent changes,
  // `submittedFor === intent` is false again naturally, so the form is
  // shown afresh without needing a reset effect.
  const [submittedFor, setSubmittedFor] = useState<OmniboxIntent | null>(
    null,
  );

  if (!intent) {
    return (
      <Card className="p-6 text-center text-gray-600 text-sm">
        Didn&rsquo;t catch that. Try &ldquo;show me people&rdquo; or
        &ldquo;add milk to groceries&rdquo;.
      </Card>
    );
  }

  const mod = getModuleById(intent.moduleId);
  if (!mod || !mod.omnibox) {
    return (
      <Card className="p-6 text-center text-gray-600 text-sm">
        The omnibox routed to &ldquo;{intent.moduleId}&rdquo; but that module
        isn&rsquo;t omnibox-enabled.
      </Card>
    );
  }

  const showAsList = intent.kind === 'list' || submittedFor === intent;

  return (
    <div className="space-y-4" data-testid="omnibox-result">
      <IntentBanner
        rationale={rationale ?? intent.rationale}
        fallback={fallback}
        moduleName={mod.name}
        moduleBasePath={mod.basePath}
      />
      {showAsList ? (
        <OmniboxListView
          moduleId={intent.moduleId}
          adapter={mod.omnibox}
          filters={intent.kind === 'list' ? intent.filters : undefined}
        />
      ) : (
        <OmniboxFormView
          adapter={mod.omnibox}
          formId={intent.formId}
          prefill={intent.formPrefill}
          onSuccess={() => setSubmittedFor(intent)}
        />
      )}
    </div>
  );
}

interface IntentBannerProps {
  rationale?: string;
  fallback?: boolean;
  moduleName: string;
  moduleBasePath: string;
}

function IntentBanner({
  rationale,
  fallback,
  moduleName,
  moduleBasePath,
}: IntentBannerProps) {
  return (
    <div data-testid="omnibox-banner">
    <Card
      className="p-3 bg-gray-50 border-gray-200 flex items-start gap-3"
    >
      <Sparkles
        className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="flex-1 text-sm text-gray-700">
        <span className="font-medium text-gray-900">{moduleName}</span>
        {fallback && (
          <span className="ml-2 text-xs text-gray-500">
            (didn&rsquo;t quite understand — showing the closest module)
          </span>
        )}
        {rationale && !fallback && (
          <span className="ml-2 text-xs text-gray-500">{rationale}</span>
        )}
      </div>
      <Link
        href={moduleBasePath}
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        data-testid="omnibox-open-module"
      >
        Open in full module
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </Link>
    </Card>
    </div>
  );
}
