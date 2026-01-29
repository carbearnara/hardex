import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('supabase');

export interface RentalPriceRecord {
  id?: number;
  gpu_type: string;
  timestamp: number;
  avg_price: number;
  min_price: number;
  max_price: number;
  offer_count: number;
  interruptible_avg: number | null;
  on_demand_avg: number | null;
  created_at?: string;
}

let supabase: SupabaseClient | null = null;

export function initSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    logger.warn('Supabase not configured - SUPABASE_URL and SUPABASE_ANON_KEY required');
    logger.warn(`SUPABASE_URL: ${url ? 'set' : 'missing'}, SUPABASE_ANON_KEY: ${key ? 'set' : 'missing'}`);
    return null;
  }

  supabase = createClient(url, key);
  logger.info(`Supabase client initialized for ${url}`);
  return supabase;
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}

export async function storeRentalPrices(records: Omit<RentalPriceRecord, 'id' | 'created_at'>[]): Promise<void> {
  if (!supabase) {
    logger.debug('Supabase not configured, skipping storage');
    return;
  }

  try {
    const { error } = await supabase
      .from('rental_prices')
      .insert(records);

    if (error) {
      logger.error('Failed to store rental prices:', error);
    } else {
      logger.debug(`Stored ${records.length} rental price records`);
    }
  } catch (err) {
    logger.error('Error storing rental prices:', err);
  }
}

export async function getRentalHistory(
  gpuType?: string,
  startTime?: number,
  endTime?: number,
  limit = 1000
): Promise<RentalPriceRecord[]> {
  if (!supabase) {
    return [];
  }

  try {
    let query = supabase
      .from('rental_prices')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (gpuType) {
      query = query.eq('gpu_type', gpuType);
    }
    if (startTime) {
      query = query.gte('timestamp', startTime);
    }
    if (endTime) {
      query = query.lte('timestamp', endTime);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Failed to fetch rental history:', error);
      return [];
    }

    logger.debug(`Fetched ${data?.length || 0} rental history records`);
    return data || [];
  } catch (err) {
    logger.error('Error fetching rental history:', err);
    return [];
  }
}

export async function getLatestPrices(): Promise<Record<string, RentalPriceRecord>> {
  if (!supabase) {
    return {};
  }

  try {
    // Get the latest record for each GPU type
    const { data, error } = await supabase
      .from('rental_prices')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      logger.error('Failed to fetch latest prices:', error);
      return {};
    }

    // Group by GPU type and take the first (latest) for each
    const latest: Record<string, RentalPriceRecord> = {};
    for (const record of data || []) {
      if (!latest[record.gpu_type]) {
        latest[record.gpu_type] = record;
      }
    }

    return latest;
  } catch (err) {
    logger.error('Error fetching latest prices:', err);
    return {};
  }
}

export async function getStorageStats(): Promise<{
  totalRecords: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  recordsByGpu: Record<string, number>;
}> {
  if (!supabase) {
    return { totalRecords: 0, oldestTimestamp: null, newestTimestamp: null, recordsByGpu: {} };
  }

  try {
    const { count } = await supabase
      .from('rental_prices')
      .select('*', { count: 'exact', head: true });

    const { data: oldest } = await supabase
      .from('rental_prices')
      .select('timestamp')
      .order('timestamp', { ascending: true })
      .limit(1)
      .single();

    const { data: newest } = await supabase
      .from('rental_prices')
      .select('timestamp')
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    // Get counts by GPU type
    const { data: gpuCounts } = await supabase
      .from('rental_prices')
      .select('gpu_type');

    const recordsByGpu: Record<string, number> = {};
    for (const record of gpuCounts || []) {
      recordsByGpu[record.gpu_type] = (recordsByGpu[record.gpu_type] || 0) + 1;
    }

    return {
      totalRecords: count || 0,
      oldestTimestamp: oldest?.timestamp || null,
      newestTimestamp: newest?.timestamp || null,
      recordsByGpu,
    };
  } catch (err) {
    logger.error('Error fetching storage stats:', err);
    return { totalRecords: 0, oldestTimestamp: null, newestTimestamp: null, recordsByGpu: {} };
  }
}
