import { useState, useEffect, useCallback } from 'react';
import { useRentalPrices, type RentalPriceHistory } from '../hooks/useRentalPrices';
import { RENTAL_GPUS, type RentalGpuType } from '../types';
import { RentalCard } from './RentalCard';
import { RentalBarChart, RentalLineChart } from './RentalChart';
import { getAllPriceHistory } from '../utils/rentalStorage';

type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all';

// Time ranges that require loading from IndexedDB (longer than 2 hours of in-memory data)
const NEEDS_STORAGE_LOOKUP: TimeRange[] = ['24h', '7d', 'all'];

export function RentalTab() {
  const { prices, history, storageStats, isLoading, error, lastUpdate, dataSource } = useRentalPrices();
  const [selectedGpus, setSelectedGpus] = useState<RentalGpuType[]>(['RTX_4090', 'H100_80GB', 'A100_80GB']);
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [fullHistory, setFullHistory] = useState<Record<RentalGpuType, RentalPriceHistory[]> | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Separate consumer and datacenter GPUs
  const consumerGpus = RENTAL_GPUS.filter((g) => g.tier === 'consumer');
  const datacenterGpus = RENTAL_GPUS.filter((g) => g.tier === 'datacenter');

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const toggleGpu = (gpuType: RentalGpuType) => {
    setSelectedGpus((prev) =>
      prev.includes(gpuType)
        ? prev.filter((g) => g !== gpuType)
        : [...prev, gpuType]
    );
  };

  // Load full history from IndexedDB when needed
  const loadStoredHistory = useCallback(async () => {
    if (!NEEDS_STORAGE_LOOKUP.includes(timeRange)) {
      setFullHistory(null);
      return;
    }

    setIsLoadingHistory(true);
    try {
      const storedHistory = await getAllPriceHistory();
      setFullHistory(storedHistory);
    } catch (err) {
      console.error('Failed to load stored history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [timeRange]);

  // Load full history when time range changes to a longer period
  useEffect(() => {
    loadStoredHistory();
  }, [loadStoredHistory]);

  // Filter history based on time range
  const getFilteredHistory = useCallback(() => {
    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };

    // Use full history from IndexedDB for longer ranges, otherwise use in-memory history
    const sourceHistory = NEEDS_STORAGE_LOOKUP.includes(timeRange) && fullHistory
      ? fullHistory
      : history;

    const cutoff = now - ranges[timeRange];
    const filtered: Record<RentalGpuType, RentalPriceHistory[]> = {} as Record<RentalGpuType, RentalPriceHistory[]>;

    for (const [gpuType, gpuHistory] of Object.entries(sourceHistory)) {
      filtered[gpuType as RentalGpuType] = gpuHistory.filter(
        (h) => h.timestamp >= cutoff
      );
    }

    return filtered;
  }, [history, fullHistory, timeRange]);

  const filteredHistory = getFilteredHistory();

  const formatStorageDate = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString();
  };

  // Count data points in filtered history
  const dataPointCount = Object.values(filteredHistory).reduce((sum, h) => sum + h.length, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">GPU Rental Pricing</h2>
          <p className="text-sm text-slate-400 mt-1">
            {dataSource === 'supabase'
              ? 'Live cloud GPU rental rates from Vast.ai marketplace'
              : 'Simulated GPU rental rates based on market patterns'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Data Source Indicator */}
          {dataSource !== 'loading' && (
            <div
              className={`text-xs px-2 py-1 rounded-full flex items-center gap-1.5 ${
                dataSource === 'supabase'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  dataSource === 'supabase' ? 'bg-green-400' : 'bg-amber-400'
                }`}
              ></div>
              {dataSource === 'supabase' ? 'Live Data' : 'Simulated'}
            </div>
          )}
          {storageStats && storageStats.totalRecords > 0 && (
            <div className="text-xs text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-lg">
              <span className="text-slate-400">{storageStats.totalRecords.toLocaleString()}</span> records stored
              {storageStats.oldestTimestamp && (
                <span className="ml-2">
                  (since {formatStorageDate(storageStats.oldestTimestamp)})
                </span>
              )}
            </div>
          )}
          {lastUpdate && (
            <div className="text-xs text-slate-500">
              Updated: {formatTime(lastUpdate)}
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm">Failed to load rental prices: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !prices && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Price Comparison Chart */}
      {prices && (
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
          <h3 className="text-lg font-medium text-white mb-4">Price Comparison ($/hr)</h3>
          <RentalBarChart prices={prices} />
        </div>
      )}

      {/* Price History Chart */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-white">Price History</h3>
              {dataPointCount > 0 && (
                <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                  {dataPointCount.toLocaleString()} data points
                </span>
              )}
              {isLoadingHistory && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              )}
            </div>
            {/* Time Range Selector */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
              {(['1h', '6h', '24h', '7d', 'all'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {range === 'all' ? 'All' : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {/* GPU Selector */}
          <div className="flex flex-wrap gap-2">
            {RENTAL_GPUS.map((gpu) => (
              <button
                key={gpu.id}
                onClick={() => toggleGpu(gpu.id)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  selectedGpus.includes(gpu.id)
                    ? gpu.tier === 'consumer'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:border-slate-500'
                }`}
              >
                {gpu.name}
              </button>
            ))}
          </div>
        </div>
        <RentalLineChart history={filteredHistory} selectedGpus={selectedGpus} />
      </div>

      {/* Consumer GPUs Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <h3 className="text-lg font-medium text-white">Consumer GPUs</h3>
          <span className="text-xs text-slate-500">Best for inference & hobby projects</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {consumerGpus.map((gpu) => (
            <RentalCard
              key={gpu.id}
              gpu={gpu}
              stats={prices?.[gpu.id] || null}
            />
          ))}
        </div>
      </div>

      {/* Datacenter GPUs Section */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-purple-500"></div>
          <h3 className="text-lg font-medium text-white">Datacenter GPUs</h3>
          <span className="text-xs text-slate-500">Best for training & production</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datacenterGpus.map((gpu) => (
            <RentalCard
              key={gpu.id}
              gpu={gpu}
              stats={prices?.[gpu.id] || null}
            />
          ))}
        </div>
      </div>

      {/* Market Info */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-2">About Rental Pricing</h4>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>
            <span className="text-green-400">Interruptible</span> instances can be preempted
            but cost 40-60% less
          </li>
          <li>
            <span className="text-white">On-Demand</span> instances are guaranteed but cost more
          </li>
          <li>
            Prices vary by region, reliability score, and market demand
          </li>
          <li>
            Data from{' '}
            <a
              href="https://vast.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              Vast.ai
            </a>{' '}
            marketplace
          </li>
        </ul>
      </div>
    </div>
  );
}
