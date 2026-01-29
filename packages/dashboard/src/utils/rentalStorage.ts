/**
 * Long-term storage for rental price data using IndexedDB
 * Stores price history for extended periods (weeks/months)
 */

import type { RentalGpuType } from '../types';
import type { RentalPriceHistory } from '../hooks/useRentalPrices';

const DB_NAME = 'hardex-rental-db';
const DB_VERSION = 1;
const STORE_NAME = 'price-history';

// Data retention settings
const MAX_RECORDS_PER_GPU = 10000; // ~1 week at 1-min intervals
const AGGREGATION_THRESHOLD = 1440; // Aggregate after 1 day of minute data

interface StoredPriceRecord {
  id?: number;
  gpuType: RentalGpuType;
  timestamp: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  offerCount: number;
  isAggregated?: boolean; // True if this is hourly/daily aggregated data
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[Storage] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store with auto-increment key
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });

        // Create indexes for efficient queries
        store.createIndex('gpuType', 'gpuType', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('gpuType_timestamp', ['gpuType', 'timestamp'], { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Store a price record
 */
export async function storePriceRecord(record: Omit<StoredPriceRecord, 'id'>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.add(record);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to store price record:', error);
  }
}

/**
 * Store multiple price records (batch)
 */
export async function storePriceRecords(
  records: Array<{ gpuType: RentalGpuType; data: RentalPriceHistory }>
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    for (const { gpuType, data } of records) {
      store.add({
        gpuType,
        timestamp: data.timestamp,
        avgPrice: data.avgPrice,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        offerCount: data.offerCount,
        isAggregated: false,
      });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to store price records:', error);
  }
}

/**
 * Get price history for a GPU type within a time range
 */
export async function getPriceHistory(
  gpuType: RentalGpuType,
  startTime?: number,
  endTime?: number
): Promise<RentalPriceHistory[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('gpuType_timestamp');

    const start = startTime ?? 0;
    const end = endTime ?? Date.now();

    const range = IDBKeyRange.bound([gpuType, start], [gpuType, end]);
    const request = index.getAll(range);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result as StoredPriceRecord[];
        resolve(
          records.map((r) => ({
            timestamp: r.timestamp,
            avgPrice: r.avgPrice,
            minPrice: r.minPrice,
            maxPrice: r.maxPrice,
            offerCount: r.offerCount,
          }))
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to get price history:', error);
    return [];
  }
}

/**
 * Get all price history for all GPUs
 */
export async function getAllPriceHistory(): Promise<Record<RentalGpuType, RentalPriceHistory[]>> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const records = request.result as StoredPriceRecord[];
        const history: Record<string, RentalPriceHistory[]> = {};

        for (const record of records) {
          if (!history[record.gpuType]) {
            history[record.gpuType] = [];
          }
          history[record.gpuType].push({
            timestamp: record.timestamp,
            avgPrice: record.avgPrice,
            minPrice: record.minPrice,
            maxPrice: record.maxPrice,
            offerCount: record.offerCount,
          });
        }

        // Sort each GPU's history by timestamp
        for (const gpuType of Object.keys(history)) {
          history[gpuType].sort((a, b) => a.timestamp - b.timestamp);
        }

        resolve(history as Record<RentalGpuType, RentalPriceHistory[]>);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to get all price history:', error);
    return {} as Record<RentalGpuType, RentalPriceHistory[]>;
  }
}

/**
 * Get record count for a GPU type
 */
export async function getRecordCount(gpuType: RentalGpuType): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('gpuType');
    const request = index.count(gpuType);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to get record count:', error);
    return 0;
  }
}

/**
 * Aggregate old minute-level data into hourly averages
 * This reduces storage while preserving trends
 */
export async function aggregateOldData(gpuType: RentalGpuType): Promise<void> {
  try {
    const count = await getRecordCount(gpuType);

    if (count < AGGREGATION_THRESHOLD) {
      return; // Not enough data to aggregate yet
    }

    const db = await openDB();

    // Get records older than 24 hours that aren't already aggregated
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000;
    const history = await getPriceHistory(gpuType, 0, cutoffTime);

    if (history.length < 60) {
      return; // Not enough old data
    }

    // Group by hour
    const hourlyGroups = new Map<number, RentalPriceHistory[]>();

    for (const record of history) {
      const hourKey = Math.floor(record.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000);
      if (!hourlyGroups.has(hourKey)) {
        hourlyGroups.set(hourKey, []);
      }
      hourlyGroups.get(hourKey)!.push(record);
    }

    // Create hourly aggregates
    const aggregates: StoredPriceRecord[] = [];

    for (const [hourTimestamp, records] of hourlyGroups) {
      if (records.length < 2) continue;

      const avgPrice = records.reduce((sum, r) => sum + r.avgPrice, 0) / records.length;
      const minPrice = Math.min(...records.map((r) => r.minPrice));
      const maxPrice = Math.max(...records.map((r) => r.maxPrice));
      const avgOfferCount = Math.round(
        records.reduce((sum, r) => sum + r.offerCount, 0) / records.length
      );

      aggregates.push({
        gpuType,
        timestamp: hourTimestamp,
        avgPrice: Math.round(avgPrice * 1000) / 1000,
        minPrice,
        maxPrice,
        offerCount: avgOfferCount,
        isAggregated: true,
      });
    }

    // Step 1: Delete old non-aggregated records in a separate transaction
    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
    const deleteStore = deleteTx.objectStore(STORE_NAME);
    const deleteIndex = deleteStore.index('gpuType_timestamp');

    const range = IDBKeyRange.bound([gpuType, 0], [gpuType, cutoffTime]);

    await new Promise<void>((resolve, reject) => {
      const cursorRequest = deleteIndex.openCursor(range);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as StoredPriceRecord;
          if (!record.isAggregated) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
      deleteTx.oncomplete = () => resolve();
      deleteTx.onerror = () => reject(deleteTx.error);
    });

    // Step 2: Insert aggregates in a new transaction
    const insertTx = db.transaction(STORE_NAME, 'readwrite');
    const insertStore = insertTx.objectStore(STORE_NAME);

    for (const aggregate of aggregates) {
      insertStore.add(aggregate);
    }

    await new Promise<void>((resolve, reject) => {
      insertTx.oncomplete = () => resolve();
      insertTx.onerror = () => reject(insertTx.error);
    });

    console.log(`[Storage] Aggregated ${history.length} records into ${aggregates.length} hourly records for ${gpuType}`);
  } catch (error) {
    console.error('[Storage] Failed to aggregate data:', error);
  }
}

/**
 * Clean up old data to prevent storage overflow
 */
export async function cleanupOldData(gpuType: RentalGpuType): Promise<void> {
  try {
    const count = await getRecordCount(gpuType);

    if (count <= MAX_RECORDS_PER_GPU) {
      return;
    }

    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('gpuType_timestamp');

    // Get oldest records to delete
    const deleteCount = count - MAX_RECORDS_PER_GPU;
    const range = IDBKeyRange.bound([gpuType, 0], [gpuType, Date.now()]);
    const cursorRequest = index.openCursor(range);

    let deleted = 0;

    cursorRequest.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor && deleted < deleteCount) {
        cursor.delete();
        deleted++;
        cursor.continue();
      }
    };

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log(`[Storage] Cleaned up ${deleted} old records for ${gpuType}`);
  } catch (error) {
    console.error('[Storage] Failed to cleanup old data:', error);
  }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(): Promise<{
  totalRecords: number;
  recordsByGpu: Record<string, number>;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const allRequest = store.getAll();

    return new Promise((resolve, reject) => {
      allRequest.onsuccess = () => {
        const records = allRequest.result as StoredPriceRecord[];
        const recordsByGpu: Record<string, number> = {};

        let oldestTimestamp: number | null = null;
        let newestTimestamp: number | null = null;

        for (const record of records) {
          recordsByGpu[record.gpuType] = (recordsByGpu[record.gpuType] || 0) + 1;

          if (oldestTimestamp === null || record.timestamp < oldestTimestamp) {
            oldestTimestamp = record.timestamp;
          }
          if (newestTimestamp === null || record.timestamp > newestTimestamp) {
            newestTimestamp = record.timestamp;
          }
        }

        resolve({
          totalRecords: records.length,
          recordsByGpu,
          oldestTimestamp,
          newestTimestamp,
        });
      };
      allRequest.onerror = () => reject(allRequest.error);
    });
  } catch (error) {
    console.error('[Storage] Failed to get storage stats:', error);
    return {
      totalRecords: 0,
      recordsByGpu: {},
      oldestTimestamp: null,
      newestTimestamp: null,
    };
  }
}

/**
 * Clear all stored data
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    console.log('[Storage] Cleared all data');
  } catch (error) {
    console.error('[Storage] Failed to clear data:', error);
  }
}

/**
 * Export data as JSON
 */
export async function exportData(): Promise<string> {
  const history = await getAllPriceHistory();
  const stats = await getStorageStats();

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    stats,
    history,
  }, null, 2);
}
