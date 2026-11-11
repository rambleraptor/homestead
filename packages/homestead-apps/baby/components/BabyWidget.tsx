import { Link, useNavigate } from 'react-router-dom';
import { Baby as BabyIcon } from 'lucide-react';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useBabies } from '../hooks/useBabies';
import { useBabyLog } from '../hooks/useBabyLog';
import { LogButtons } from './LogButtons';
import { StatusTiles } from './StatusTiles';

/** The baby's status and the log buttons, without leaving the dashboard. */
export function BabyWidget() {
  const navigate = useNavigate();
  const babies = useBabies();
  const baby = babies.data?.[0];
  const log = useBabyLog(baby);
  const error = babies.error ?? log.error;

  return (
    <WidgetCard icon={BabyIcon} title={baby?.name ?? 'Baby'} href="/baby">
      <div className="space-y-3" data-testid="baby-widget">
        {error ? (
          <QueryError error={error} onRetry={() => void (babies.error ? babies.refetch() : log.refetch())} compact />
        ) : babies.isLoading ? null : !baby ? (
          <p className="text-sm text-text-muted">
            <Link to="/baby" className="text-accent-terracotta hover:underline">
              Set up the baby log
            </Link>{' '}
            to track feeds, diapers and sleep.
          </p>
        ) : (
          <>
            <StatusTiles log={log} />
            <LogButtons log={log} onBottle={() => navigate('/baby?log=bottle')} />
          </>
        )}
      </div>
    </WidgetCard>
  );
}
