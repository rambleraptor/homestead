/**
 * Credit Card Dashboard Component
 *
 * Displays KPI cards showing overall perk tracking stats
 */

import { TrendingUp, TrendingDown, DollarSign, Target, Percent } from 'lucide-react';
import type { DashboardStats } from '../types';

interface CreditCardDashboardProps {
  stats: DashboardStats;
}

export function CreditCardDashboard({ stats }: CreditCardDashboardProps) {
  const isPositive = stats.netValue >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="credit-card-dashboard">
      {/* Net Value */}
      <div className={`rounded-lg p-4 border ${
        isPositive
          ? 'bg-green-50 border-green-200'
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-600" />
          )}
          <span className="text-xs font-medium text-gray-600">Net Value</span>
        </div>
        <div className={`text-xl font-bold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
          {isPositive ? '+' : ''}${Math.abs(stats.netValue).toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-1">YTD redeemed vs fees</div>
      </div>

      {/* Total Annual Fees */}
      <div className="rounded-lg p-4 border border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">Annual Fees</span>
        </div>
        <div className="text-xl font-bold text-gray-900">
          ${stats.totalAnnualFees.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-1">Total across all cards</div>
      </div>

      {/* YTD Redeemed */}
      <div className="rounded-lg p-4 border border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-4 h-4 text-accent-terracotta" />
          <span className="text-xs font-medium text-gray-600">YTD Redeemed</span>
        </div>
        <div className="text-xl font-bold text-gray-900">
          ${stats.ytdRedeemed.toLocaleString()}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          of ${stats.totalPerkValuePerYear.toLocaleString()} available
        </div>
      </div>

      {/* Coverage */}
      <div className="rounded-lg p-4 border border-gray-200 bg-white">
        <div className="flex items-center gap-2 mb-1">
          <Percent className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-medium text-gray-600">Coverage</span>
        </div>
        <div className="text-xl font-bold text-gray-900">
          {stats.overallCoveragePercent}%
        </div>
        <div className="text-xs text-gray-500 mt-1">Fee recovery rate</div>
      </div>
    </div>
  );
}
