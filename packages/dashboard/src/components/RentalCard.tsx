import { useState } from 'react';
import type { RentalGpuInfo, RentalPriceStats } from '../types';

interface RentalCardProps {
  gpu: RentalGpuInfo;
  stats: RentalPriceStats | null;
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}/hr`;
}

export function RentalCard({ gpu, stats }: RentalCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isDatacenter = gpu.tier === 'datacenter';
  const tierColor = isDatacenter ? 'text-purple-400' : 'text-green-400';
  const tierBg = isDatacenter ? 'bg-purple-500/10' : 'bg-green-500/10';

  return (
    <div
      className="relative bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors cursor-pointer"
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-white">{gpu.name}</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${tierBg} ${tierColor}`}
            >
              {gpu.tier}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{gpu.vram}GB VRAM</p>
        </div>

        {/* GPU Icon */}
        <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            />
          </svg>
        </div>
      </div>

      {/* Price Display */}
      {stats ? (
        <div className="space-y-3">
          {/* Live/Estimated Badge */}
          {stats.offerCount === 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Estimated (no live offers)</span>
            </div>
          )}

          {/* Main Price */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
              {stats.offerCount > 0 ? 'Market Average' : 'Estimated Price'}
            </p>
            <p className={`text-2xl font-bold ${stats.offerCount > 0 ? 'text-white' : 'text-slate-400'}`}>
              {formatPrice(stats.avgPrice)}
            </p>
          </div>

          {/* Price Range */}
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-slate-500 text-xs">Min</p>
              <p className={`font-medium ${stats.offerCount > 0 ? 'text-green-400' : 'text-slate-500'}`}>
                {formatPrice(stats.minPrice)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-xs">Max</p>
              <p className={`font-medium ${stats.offerCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>
                {formatPrice(stats.maxPrice)}
              </p>
            </div>
          </div>

          {/* Offer Count */}
          <div className="pt-2 border-t border-slate-700">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Available Offers</span>
              <span className={`font-medium ${stats.offerCount > 0 ? 'text-white' : 'text-slate-500'}`}>
                {stats.offerCount > 0 ? stats.offerCount : 'None'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center">
          <div className="animate-pulse text-slate-500">Loading...</div>
        </div>
      )}

      {/* Hover Details */}
      {showDetails && stats && (
        <div className="absolute bottom-full left-0 mb-2 w-full z-20">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
            <p className="text-xs text-slate-400 mb-2">Pricing Breakdown</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">On-Demand Avg</span>
                <span className="text-white">
                  {stats.onDemandAvg > 0 ? formatPrice(stats.onDemandAvg) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Interruptible Avg</span>
                <span className="text-green-400">
                  {stats.interruptibleAvg > 0
                    ? formatPrice(stats.interruptibleAvg)
                    : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Median Price</span>
                <span className="text-white">{formatPrice(stats.medianPrice)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700">
              Source: Vast.ai Marketplace
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
