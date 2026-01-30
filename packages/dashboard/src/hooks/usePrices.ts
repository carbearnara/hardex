import { useState, useEffect, useCallback, useRef } from 'react';
import type { AssetId, PriceData, PriceHistory } from '../types';
import { useServiceWorker } from './useServiceWorker';

const API_BASE = import.meta.env.VITE_ORACLE_API_URL || '/api';
const POLL_INTERVAL = 5000; // 5 seconds for foreground polling
const MAX_HISTORY_POINTS = 2000; // Extended history from Supabase
const CACHE_KEY_HISTORY = 'hardex_price_history';
const CACHE_KEY_PRICES = 'hardex_last_prices';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour cache

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface UsePricesResult {
  prices: Record<AssetId, PriceData> | null;
  history: Record<AssetId, PriceHistory[]>;
  isConnected: boolean;
  lastUpdate: number | null;
  error: string | null;
  refetch: () => Promise<void>;
}

// Load cached data from localStorage
function loadFromCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedData<T> = JSON.parse(cached);

    // Check if cache is still valid
    if (Date.now() - parsed.timestamp > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

// Save data to localStorage with timestamp
function saveToCache<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // localStorage might be full or disabled
  }
}

export function usePrices(): UsePricesResult {
  // Initialize state from cache
  const [prices, setPrices] = useState<Record<AssetId, PriceData> | null>(() => {
    return loadFromCache<Record<AssetId, PriceData>>(CACHE_KEY_PRICES);
  });

  const [history, setHistory] = useState<Record<AssetId, PriceHistory[]>>(() => {
    return loadFromCache<Record<AssetId, PriceHistory[]>>(CACHE_KEY_HISTORY) || ({} as Record<AssetId, PriceHistory[]>);
  });

  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previousPrices = useRef<Record<AssetId, PriceData> | null>(null);
  const historyLoadedRef = useRef<boolean>(false);

  // Fetch historical data from Supabase on mount
  useEffect(() => {
    if (historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    const fetchHistoricalData = async () => {
      try {
        const endTime = Date.now();
        const startTime = endTime - 7 * 24 * 60 * 60 * 1000; // Last 7 days

        const response = await fetch(
          `${API_BASE}/prices/history?startTime=${startTime}&endTime=${endTime}&limit=5000`
        );

        if (!response.ok) {
          console.warn('Historical hardware data not available:', response.status);
          return;
        }

        const data = await response.json();

        if (!data.history || data.history.length === 0) {
          return;
        }

        // Group history by asset ID
        const groupedHistory: Record<AssetId, PriceHistory[]> = {} as Record<AssetId, PriceHistory[]>;

        for (const record of data.history) {
          const assetId = record.assetId as AssetId;
          if (!groupedHistory[assetId]) {
            groupedHistory[assetId] = [];
          }
          groupedHistory[assetId].push({
            timestamp: record.timestamp,
            price: record.price,
            twap: record.twap,
          });
        }

        // Sort by timestamp
        for (const assetId of Object.keys(groupedHistory) as AssetId[]) {
          groupedHistory[assetId].sort((a, b) => a.timestamp - b.timestamp);
        }

        // Merge with existing history
        setHistory((prev) => {
          const merged: Record<AssetId, PriceHistory[]> = {} as Record<AssetId, PriceHistory[]>;

          const allAssetIds = new Set([
            ...Object.keys(prev),
            ...Object.keys(groupedHistory),
          ]) as Set<AssetId>;

          for (const assetId of allAssetIds) {
            const prevHistory = prev[assetId] || [];
            const newHistory = groupedHistory[assetId] || [];

            // Merge and deduplicate by timestamp
            const combined = [...newHistory, ...prevHistory];
            const seen = new Set<number>();
            const deduped = combined.filter((item) => {
              if (seen.has(item.timestamp)) return false;
              seen.add(item.timestamp);
              return true;
            });

            deduped.sort((a, b) => a.timestamp - b.timestamp);
            merged[assetId] = deduped.slice(-MAX_HISTORY_POINTS);
          }

          return merged;
        });

        console.log(`Loaded ${data.history.length} historical hardware price records`);
      } catch (err) {
        console.warn('Failed to fetch historical hardware data:', err);
      }
    };

    fetchHistoricalData();
  }, []);

  // Handle service worker messages for background updates
  const handleSWMessage = useCallback((message: { type: string; data?: unknown; timestamp?: number }) => {
    if (message.type === 'PRICE_UPDATE' && message.data) {
      const priceData = message.data as { prices: Record<AssetId, PriceData>; timestamp: number };
      if (priceData.prices) {
        updatePriceState(priceData.prices, priceData.timestamp || Date.now());
      }
    }
  }, []);

  // Register service worker for background updates (auto-starts when registered)
  useServiceWorker(handleSWMessage);

  // Common function to update price state
  const updatePriceState = useCallback((newPrices: Record<AssetId, PriceData>, timestamp: number) => {
    setPrices(newPrices);
    setLastUpdate(timestamp);
    setIsConnected(true);
    setError(null);

    // Update history
    setHistory((prev) => {
      const newHistory = { ...prev };

      for (const [assetId, priceData] of Object.entries(newPrices) as [AssetId, PriceData][]) {
        const assetHistory = newHistory[assetId] || [];
        const newPoint: PriceHistory = {
          timestamp,
          price: priceData.price,
          twap: priceData.twap,
        };

        // Only add if timestamp is different from last point
        if (assetHistory.length === 0 || assetHistory[assetHistory.length - 1].timestamp !== timestamp) {
          newHistory[assetId] = [...assetHistory.slice(-MAX_HISTORY_POINTS + 1), newPoint];
        }
      }

      return newHistory;
    });

    previousPrices.current = newPrices;
  }, []);

  // Save history to cache whenever it changes
  useEffect(() => {
    if (Object.keys(history).length > 0) {
      saveToCache(CACHE_KEY_HISTORY, history);
    }
  }, [history]);

  // Save prices to cache whenever they change
  useEffect(() => {
    if (prices) {
      saveToCache(CACHE_KEY_PRICES, prices);
    }
  }, [prices]);

  const fetchPrices = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/prices`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      updatePriceState(data.prices, data.timestamp);
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    }
  }, [updatePriceState]);

  useEffect(() => {
    fetchPrices();

    const interval = setInterval(fetchPrices, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchPrices]);

  return {
    prices,
    history,
    isConnected,
    lastUpdate,
    error,
    refetch: fetchPrices,
  };
}

export function usePriceChange(
  currentPrice: number | undefined,
  assetId: AssetId
): { direction: 'up' | 'down' | null; percentage: number } {
  const previousPrice = useRef<number | undefined>();
  const [change, setChange] = useState<{ direction: 'up' | 'down' | null; percentage: number }>({
    direction: null,
    percentage: 0,
  });

  useEffect(() => {
    if (currentPrice !== undefined && previousPrice.current !== undefined) {
      if (currentPrice > previousPrice.current) {
        const pct = ((currentPrice - previousPrice.current) / previousPrice.current) * 100;
        setChange({ direction: 'up', percentage: pct });
      } else if (currentPrice < previousPrice.current) {
        const pct = ((previousPrice.current - currentPrice) / previousPrice.current) * 100;
        setChange({ direction: 'down', percentage: pct });
      }

      // Reset after animation
      const timeout = setTimeout(() => {
        setChange((prev) => ({ ...prev, direction: null }));
      }, 500);

      return () => clearTimeout(timeout);
    }

    previousPrice.current = currentPrice;
  }, [currentPrice, assetId]);

  return change;
}
