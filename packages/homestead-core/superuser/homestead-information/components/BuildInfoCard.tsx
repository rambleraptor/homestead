import { GitCommit } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';

/**
 * Build / git-commit info for this instance. The values are injected at build
 * time by Vite's `define` (see the SPA's vite.config), so this reads them
 * straight off `process.env` — no runtime endpoint. Moved here from Settings.
 */
export function BuildInfoCard() {
  const commitHash = process.env.NEXT_PUBLIC_COMMIT_HASH || 'unknown';
  const commitDate = process.env.NEXT_PUBLIC_COMMIT_DATE || 'unknown';
  const commitMessage = process.env.NEXT_PUBLIC_COMMIT_MESSAGE || 'unknown';

  const shortHash =
    commitHash && commitHash !== 'unknown' ? commitHash.slice(0, 7) : commitHash;
  const formattedDate =
    commitDate && commitDate !== 'unknown'
      ? new Date(commitDate).toLocaleString()
      : commitDate;

  return (
    <div>
      <h2 className="text-xl font-semibold text-brand-navy mb-4">Build</h2>

      <Card>
        <div className="flex items-start gap-4">
          <GitCommit className="w-6 h-6 text-text-muted mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold text-brand-navy mb-2">Build Info</h3>
            <dl className="text-sm text-text-muted space-y-2">
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">Commit:</dt>
                <dd
                  className="font-mono break-all"
                  data-testid="homestead-info-commit-hash"
                  title={commitHash}
                >
                  {shortHash}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">Date:</dt>
                <dd data-testid="homestead-info-commit-date">{formattedDate}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-gray-700 w-24 shrink-0">Message:</dt>
                <dd data-testid="homestead-info-commit-message">{commitMessage}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>
    </div>
  );
}
