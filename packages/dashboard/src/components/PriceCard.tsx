import { useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Database, AlertTriangle } from 'lucide-react';
import type { AssetInfo, PriceData, PriceHistory } from '../types';
import { usePriceChange } from '../hooks/usePrices';
import { MiniChart } from './MiniChart';

interface PriceCardProps {
  asset: AssetInfo;
  priceData: PriceData | undefined;
  history: PriceHistory[];
}

export function PriceCard({ asset, priceData, history }: PriceCardProps) {
  const { direction } = usePriceChange(priceData?.price, asset.id);
  const [showSources, setShowSources] = useState(false);

  const formatPrice = (price: number, currency?: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const getPriceChangePercent = () => {
    if (history.length < 2) return null;
    const oldPrice = history[0].price;
    const newPrice = history[history.length - 1].price;
    if (oldPrice === 0) return null;
    return ((newPrice - oldPrice) / oldPrice) * 100;
  };

  const changePercent = getPriceChangePercent();
  const isPositive = changePercent !== null && changePercent >= 0;
  const hasSimulatedData = priceData?.sources?.some((s) => s.isSimulated);

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl border bg-slate-900/50 p-6
        transition-all duration-300 hover:bg-slate-900/80
        ${direction === 'up' ? 'flash-up border-primary-500/50' : ''}
        ${direction === 'down' ? 'flash-down border-red-500/50' : 'border-slate-800'}
      `}
    >
      {/* Category Badge */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {hasSimulatedData && (
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Simulated
          </span>
        )}
        <span
          className={`
            text-xs font-medium px-2 py-1 rounded-full
            ${asset.category === 'GPU' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}
          `}
        >
          {asset.category}
        </span>
      </div>

      {/* Asset Info */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{asset.name}</h3>
        <p className="text-sm text-slate-400">{asset.description}</p>
      </div>

      {/* Price Display */}
      {priceData ? (
        <>
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white font-mono">
                {formatPrice(priceData.price, priceData.currency)}
              </span>
              {changePercent !== null && (
                <span
                  className={`flex items-center text-sm font-medium ${
                    isPositive ? 'text-primary-500' : 'text-red-500'
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-4 h-4 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 mr-1" />
                  )}
                  {Math.abs(changePercent).toFixed(2)}%
                </span>
              )}
            </div>

            {/* Currency & TWAP */}
            <div className="flex items-center gap-4 mt-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">Currency:</span>
                <span className="text-xs text-slate-400 font-mono font-medium">
                  {priceData.currency || 'USD'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500">TWAP:</span>
                <span className="text-sm text-slate-400 font-mono">
                  {formatPrice(priceData.twap, priceData.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Mini Chart */}
          <div className="h-16 mb-4">
            <MiniChart data={history} isPositive={isPositive} />
          </div>

          {/* Metadata - Sources with hover */}
          <div className="relative">
            <div
              className="flex items-center justify-between text-xs text-slate-500 cursor-pointer"
              onMouseEnter={() => setShowSources(true)}
              onMouseLeave={() => setShowSources(false)}
            >
              <div className="flex items-center gap-1 hover:text-slate-300 transition-colors">
                <Database className="w-3 h-3" />
                <span>{priceData.sourceCount} sources</span>
                <span className="text-slate-600 ml-1">(hover for details)</span>
              </div>
              <span>{new Date(priceData.timestamp).toLocaleTimeString()}</span>
            </div>

            {/* Sources Tooltip */}
            {showSources && priceData.sources && priceData.sources.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-full z-20">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                  <div className="text-xs font-medium text-slate-300 mb-2 flex items-center justify-between">
                    <span>Data Sources</span>
                    {hasSimulatedData && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Simulated Data
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {priceData.sources.map((source, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-400 flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              source.isSimulated ? 'bg-amber-500' : 'bg-primary-500'
                            }`}
                          />
                          {source.name}
                        </span>
                        <span className="text-slate-300 font-mono">
                          {formatPrice(source.price, priceData.currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-700 flex justify-between text-xs">
                    <span className="text-slate-500">Median Price</span>
                    <span className="text-white font-mono font-medium">
                      {formatPrice(priceData.price, priceData.currency)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-32">
          <div className="flex items-center gap-2 text-slate-500">
            <Minus className="w-5 h-5" />
            <span>No data available</span>
          </div>
        </div>
      )}
    </div>
  );
}
