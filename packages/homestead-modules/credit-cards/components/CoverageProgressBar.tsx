/**
 * Coverage Progress Bar Component
 *
 * Visual indicator showing how much of the annual fee has been recovered through perks.
 * Green fill up to 100%, gold overflow if you've exceeded the fee value.
 */

interface CoverageProgressBarProps {
  redeemed: number;
  annualFee: number;
  totalAvailable?: number;
}

export function CoverageProgressBar({
  redeemed,
  annualFee,
}: CoverageProgressBarProps) {
  if (annualFee === 0) {
    // No fee card: show redeemed value as pure positive
    if (redeemed === 0) return null;
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{ width: '100%' }}
          />
        </div>
        <span className="text-xs font-medium text-green-600">
          ${redeemed.toLocaleString()} earned (no fee)
        </span>
      </div>
    );
  }

  const coveragePercent = Math.round((redeemed / annualFee) * 100);
  const barPercent = Math.min(coveragePercent, 100);
  const isOverflow = coveragePercent > 100;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOverflow ? 'bg-amber-500' : coveragePercent >= 75 ? 'bg-green-500' : coveragePercent >= 50 ? 'bg-yellow-500' : 'bg-red-400'
          }`}
          style={{ width: `${barPercent}%` }}
        />
      </div>
      <span className={`text-xs font-medium whitespace-nowrap ${
        isOverflow ? 'text-amber-600' : coveragePercent >= 75 ? 'text-green-600' : 'text-gray-500'
      }`}>
        {coveragePercent}%
      </span>
    </div>
  );
}
