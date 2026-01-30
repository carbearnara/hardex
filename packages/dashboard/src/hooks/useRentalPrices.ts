import { useState, useEffect, useCallback, useRef } from 'react';
import type { RentalGpuType, RentalPriceStats } from '../types';
import {
  storePriceRecords,
  getAllPriceHistory,
  aggregateOldData,
  cleanupOldData,
  getStorageStats,
} from '../utils/rentalStorage';

const API_BASE = import.meta.env.VITE_ORACLE_API_URL || '/api';
const POLL_INTERVAL = 60000; // 1 minute for rental prices
const MAX_MEMORY_HISTORY = 120; // Keep last 2 hours in memory for charts
const MAINTENANCE_INTERVAL = 10 * 60 * 1000; // Run maintenance every 10 minutes

export interface RentalPriceHistory {
  timestamp: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  offerCount: number;
}

export interface StorageStats {
  totalRecords: number;
  recordsByGpu: Record<string, number>;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}

interface UseRentalPricesResult {
  prices: Record<RentalGpuType, RentalPriceStats> | null;
  history: Record<RentalGpuType, RentalPriceHistory[]>;
  storageStats: StorageStats | null;
  isLoading: boolean;
  error: string | null;
  lastUpdate: number | null;
  dataSource: 'supabase' | 'simulated' | 'loading';
  refetch: () => Promise<void>;
  loadFullHistory: (gpuType: RentalGpuType) => Promise<RentalPriceHistory[]>;
}

// GPU types for iteration
const GPU_TYPES: RentalGpuType[] = [
  'RTX_4090',
  'RTX_3090',
  'A100_40GB',
  'A100_80GB',
  'H100_80GB',
  'H100_PCIE',
  'A6000',
  'L40S',
];

export function useRentalPrices(): UseRentalPricesResult {
  const [prices, setPrices] = useState<Record<RentalGpuType, RentalPriceStats> | null>(null);
  const [history, setHistory] = useState<Record<RentalGpuType, RentalPriceHistory[]>>(
    {} as Record<RentalGpuType, RentalPriceHistory[]>
  );
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<'supabase' | 'simulated' | 'loading'>('loading');

  const lastMaintenanceRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);
  const historyLoadedRef = useRef<boolean>(false);

  // Fetch historical data from Supabase
  const fetchHistoricalData = useCallback(async () => {
    try {
      const endTime = Date.now();
      const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // Last 7 days

      const response = await fetch(
        `${API_BASE}/rental/history?startTime=${startTime}&endTime=${endTime}&limit=5000`
      );

      if (!response.ok) {
        console.warn('Historical data not available:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.history || data.history.length === 0) {
        return null;
      }

      // Group history by GPU type
      const groupedHistory: Record<RentalGpuType, RentalPriceHistory[]> = {} as Record<
        RentalGpuType,
        RentalPriceHistory[]
      >;

      for (const record of data.history) {
        const gpuType = record.gpuType as RentalGpuType;
        if (!groupedHistory[gpuType]) {
          groupedHistory[gpuType] = [];
        }
        groupedHistory[gpuType].push({
          timestamp: record.timestamp,
          avgPrice: record.avgPrice,
          minPrice: record.minPrice,
          maxPrice: record.maxPrice,
          offerCount: record.offerCount,
        });
      }

      // Sort by timestamp
      for (const gpuType of Object.keys(groupedHistory) as RentalGpuType[]) {
        groupedHistory[gpuType].sort((a, b) => a.timestamp - b.timestamp);
      }

      return groupedHistory;
    } catch (err) {
      console.warn('Failed to fetch historical data:', err);
      return null;
    }
  }, []);

  // Load history from IndexedDB and Supabase on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const loadData = async () => {
      // First, load from IndexedDB (fast, local cache)
      const storedHistory = await getAllPriceHistory();
      if (Object.keys(storedHistory).length > 0) {
        const recentHistory: Record<RentalGpuType, RentalPriceHistory[]> = {} as Record<
          RentalGpuType,
          RentalPriceHistory[]
        >;

        for (const [gpuType, gpuHistory] of Object.entries(storedHistory)) {
          recentHistory[gpuType as RentalGpuType] = gpuHistory.slice(-MAX_MEMORY_HISTORY);
        }

        setHistory(recentHistory);
      }

      // Load storage stats
      const stats = await getStorageStats();
      setStorageStats(stats);

      // Then, fetch historical data from Supabase
      if (!historyLoadedRef.current) {
        historyLoadedRef.current = true;

        const supabaseHistory = await fetchHistoricalData();

        if (supabaseHistory && Object.keys(supabaseHistory).length > 0) {
          // Store Supabase data in IndexedDB for caching
          const recordsToStore: Array<{ gpuType: RentalGpuType; data: RentalPriceHistory }> = [];

          for (const [gpuType, gpuHistory] of Object.entries(supabaseHistory) as [
            RentalGpuType,
            RentalPriceHistory[],
          ][]) {
            for (const record of gpuHistory) {
              recordsToStore.push({ gpuType, data: record });
            }
          }

          if (recordsToStore.length > 0) {
            storePriceRecords(recordsToStore).catch(console.error);
          }

          // Merge with existing history
          setHistory((prev) => {
            const merged: Record<RentalGpuType, RentalPriceHistory[]> = {} as Record<
              RentalGpuType,
              RentalPriceHistory[]
            >;

            const allGpuTypes = new Set([
              ...Object.keys(prev),
              ...Object.keys(supabaseHistory),
            ]) as Set<RentalGpuType>;

            for (const gpuType of allGpuTypes) {
              const prevHistory = prev[gpuType] || [];
              const newHistory = supabaseHistory[gpuType] || [];

              // Merge and deduplicate by timestamp
              const combined = [...newHistory, ...prevHistory];
              const seen = new Set<number>();
              const deduped = combined.filter((item) => {
                if (seen.has(item.timestamp)) return false;
                seen.add(item.timestamp);
                return true;
              });

              deduped.sort((a, b) => a.timestamp - b.timestamp);
              merged[gpuType] = deduped.slice(-MAX_MEMORY_HISTORY);
            }

            return merged;
          });

          const newStats = await getStorageStats();
          setStorageStats(newStats);
        }
      }
    };

    loadData();
  }, [fetchHistoricalData]);

  // Run maintenance periodically
  const runMaintenance = useCallback(async () => {
    const now = Date.now();
    if (now - lastMaintenanceRef.current < MAINTENANCE_INTERVAL) {
      return;
    }
    lastMaintenanceRef.current = now;

    for (const gpuType of GPU_TYPES) {
      await aggregateOldData(gpuType);
      await cleanupOldData(gpuType);
    }

    const stats = await getStorageStats();
    setStorageStats(stats);
  }, []);

  const fetchPrices = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_BASE}/rental/prices`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setPrices(data.prices);
      setLastUpdate(data.timestamp);
      setError(null);

      // Track data source
      if (data.source === 'supabase' || data.source === 'oracle-service') {
        setDataSource('supabase');
      } else {
        setDataSource('simulated');
      }

      // Prepare records for storage
      const recordsToStore: Array<{ gpuType: RentalGpuType; data: RentalPriceHistory }> = [];

      // Update in-memory history
      setHistory((prev) => {
        const newHistory = { ...prev };

        for (const [gpuType, stats] of Object.entries(data.prices) as [
          RentalGpuType,
          RentalPriceStats,
        ][]) {
          const gpuHistory = newHistory[gpuType] || [];
          const newPoint: RentalPriceHistory = {
            timestamp: data.timestamp,
            avgPrice: stats.avgPrice,
            minPrice: stats.minPrice,
            maxPrice: stats.maxPrice,
            offerCount: stats.offerCount,
          };

          if (gpuHistory.length === 0 || gpuHistory[gpuHistory.length - 1].timestamp !== data.timestamp) {
            newHistory[gpuType] = [...gpuHistory.slice(-MAX_MEMORY_HISTORY + 1), newPoint];
            recordsToStore.push({ gpuType, data: newPoint });
          }
        }

        return newHistory;
      });

      if (recordsToStore.length > 0) {
        storePriceRecords(recordsToStore).catch(console.error);
      }

      runMaintenance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rental prices');
    } finally {
      setIsLoading(false);
    }
  }, [runMaintenance]);

  const loadFullHistory = useCallback(async (gpuType: RentalGpuType): Promise<RentalPriceHistory[]> => {
    const allHistory = await getAllPriceHistory();
    return allHistory[gpuType] || [];
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return {
    prices,
    history,
    storageStats,
    isLoading,
    error,
    lastUpdate,
    dataSource,
    refetch: fetchPrices,
    loadFullHistory,
  };
}
