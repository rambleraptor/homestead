import { Lock, LockOpen } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Spinner } from '@rambleraptor/homestead-core/shared/components/Spinner';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useSecurityStatus } from '../hooks/useSecurityStatus';

/**
 * Encryption-at-rest status for the instance. Reads the superuser-only
 * `/api/security/status` route and shows whether a master key is configured,
 * plus what that does and (when off) how to turn it on.
 */
export function SecurityCard() {
  const { data, isLoading, isError, error, refetch } = useSecurityStatus();
  const enabled = data?.encryptionEnabled ?? false;

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Security</h2>

      <Card>
        <div className="flex items-start gap-4">
          {enabled ? (
            <Lock className="w-6 h-6 text-green-600 mt-1" />
          ) : (
            <LockOpen className="w-6 h-6 text-gray-400 mt-1" />
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-2">Encryption at rest</h3>

            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Spinner size="sm" />
                <span>Checking status…</span>
              </div>
            ) : isError ? (
              <QueryError
                compact
                error={error}
                onRetry={() => void refetch()}
                title="Couldn’t load the encryption status"
                data-testid="security-status-error"
              />
            ) : (
              <>
                <span
                  data-testid="security-encryption-status"
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {enabled ? 'On' : 'Off'}
                </span>

                {enabled ? (
                  <p className="mt-3 text-sm text-gray-600">
                    New file uploads and extracted text are encrypted on disk with this
                    instance&apos;s master key. Structured fields and the search vector store are
                    not encrypted; files written before encryption was turned on stay readable and
                    are re-encrypted the next time each record is saved.
                  </p>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-gray-600">
                      Files and extracted text are stored as plaintext. Turn on encryption at rest
                      so a stolen disk, database, or backup is unreadable without the master key.
                    </p>
                    <div className="mt-3 text-sm text-gray-600">
                      <p className="font-medium text-gray-700">To enable it:</p>
                      <ol className="mt-1 list-decimal list-inside space-y-1">
                        <li>
                          Run{' '}
                          <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                            homestead key generate
                          </code>{' '}
                          on the server (writes{' '}
                          <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                            ~/.homestead/master.key
                          </code>
                          ).
                        </li>
                        <li>Back the key up somewhere separate from your data.</li>
                        <li>Restart the server — encryption turns on for new writes.</li>
                      </ol>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
