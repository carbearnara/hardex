import { useState, useEffect, useCallback, useRef } from 'react';
import type { AssetId, PriceData, PriceHistory } from '../types';
import { useServiceWorker } from './useServiceWorker';

const API_BASE = '/api';
const POLL_INTERVAL = 5000; // 5 seconds for foreground polling
const MAX_HISTORY_POINTS = 360; // 30 minutes at 5s intervals
const CACHE_KEY_HISTORY = 'hardex_price_history';
const CACHE_KEY_PRICES = 'hardex_last_prices';
const CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

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
  clearCache: () => void;
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

  const clearCache = useCallback(() => {
    localStorage.removeItem(CACHE_KEY_HISTORY);
    localStorage.removeItem(CACHE_KEY_PRICES);
    setHistory({} as Record<AssetId, PriceHistory[]>);
  }, []);

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
    clearCache,
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
