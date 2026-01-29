import { useState, useEffect, useCallback, useRef } from 'react';
import type { RentalGpuType, RentalPriceStats } from '../types';
import {
  storePriceRecords,
  getAllPriceHistory,
  aggregateOldData,
  cleanupOldData,
  getStorageStats,
} from '../utils/rentalStorage';

const API_BASE = '/api';
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
  refetch: () => Promise<void>;
  loadFullHistory: (gpuType: RentalGpuType) => Promise<RentalPriceHistory[]>;
}

export function useRentalPrices(): UseRentalPricesResult {
  const [prices, setPrices] = useState<Record<RentalGpuType, RentalPriceStats> | null>(null);
  const [history, setHistory] = useState<Record<RentalGpuType, RentalPriceHistory[]>>({} as Record<RentalGpuType, RentalPriceHistory[]>);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const lastMaintenanceRef = useRef<number>(0);
  const initializedRef = useRef<boolean>(false);

  // Load history from IndexedDB on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    getAllPriceHistory().then((storedHistory) => {
      if (Object.keys(storedHistory).length > 0) {
        // Only keep recent history in memory for performance
        const recentHistory: Record<RentalGpuType, RentalPriceHistory[]> = {} as Record<RentalGpuType, RentalPriceHistory[]>;

        for (const [gpuType, gpuHistory] of Object.entries(storedHistory)) {
          recentHistory[gpuType as RentalGpuType] = gpuHistory.slice(-MAX_MEMORY_HISTORY);
        }

        setHistory(recentHistory);
      }
    });

    // Load storage stats
    getStorageStats().then(setStorageStats);
  }, []);

  // Run maintenance (aggregation and cleanup) periodically
  const runMaintenance = useCallback(async () => {
    const now = Date.now();
    if (now - lastMaintenanceRef.current < MAINTENANCE_INTERVAL) {
      return;
    }
    lastMaintenanceRef.current = now;

    const gpuTypes: RentalGpuType[] = ['RTX_4090', 'RTX_3090', 'A100_40GB', 'A100_80GB', 'H100_80GB', 'H100_PCIE', 'A6000', 'L40S'];

    for (const gpuType of gpuTypes) {
      await aggregateOldData(gpuType);
      await cleanupOldData(gpuType);
    }

    // Update storage stats
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

      // Prepare records for storage
      const recordsToStore: Array<{ gpuType: RentalGpuType; data: RentalPriceHistory }> = [];

      // Update in-memory history
      setHistory((prev) => {
        const newHistory = { ...prev };

        for (const [gpuType, stats] of Object.entries(data.prices) as [RentalGpuType, RentalPriceStats][]) {
          const gpuHistory = newHistory[gpuType] || [];
          const newPoint: RentalPriceHistory = {
            timestamp: data.timestamp,
            avgPrice: stats.avgPrice,
            minPrice: stats.minPrice,
            maxPrice: stats.maxPrice,
            offerCount: stats.offerCount,
          };

          // Only add if timestamp differs from last point
          if (gpuHistory.length === 0 || gpuHistory[gpuHistory.length - 1].timestamp !== data.timestamp) {
            newHistory[gpuType] = [...gpuHistory.slice(-MAX_MEMORY_HISTORY + 1), newPoint];
            recordsToStore.push({ gpuType, data: newPoint });
          }
        }

        return newHistory;
      });

      // Store to IndexedDB (async, don't block)
      if (recordsToStore.length > 0) {
        storePriceRecords(recordsToStore).catch(console.error);
      }

      // Run maintenance periodically
      runMaintenance();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rental prices');
    } finally {
      setIsLoading(false);
    }
  }, [runMaintenance]);

  // Load full history for a specific GPU from IndexedDB
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
    refetch: fetchPrices,
    loadFullHistory,
  };
}
