import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/rental/history
 * Fetches historical rental prices from Supabase
 * Query params: gpuType, startTime, endTime, limit
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(503).json({
      error: 'Supabase not configured',
      message: 'Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { gpuType, startTime, endTime, limit } = req.query;

    let query = supabase
      .from('rental_prices')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(limit ? parseInt(limit as string, 10) : 1000);

    if (gpuType) {
      query = query.eq('gpu_type', gpuType as string);
    }
    if (startTime) {
      query = query.gte('timestamp', parseInt(startTime as string, 10));
    }
    if (endTime) {
      query = query.lte('timestamp', parseInt(endTime as string, 10));
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({
        error: 'Failed to fetch history',
        details: error.message,
      });
    }

    // Transform to match frontend format
    const history = (data || []).map((record) => ({
      gpuType: record.gpu_type,
      timestamp: record.timestamp,
      avgPrice: record.avg_price,
      minPrice: record.min_price,
      maxPrice: record.max_price,
      offerCount: record.offer_count,
      interruptibleAvg: record.interruptible_avg,
      onDemandAvg: record.on_demand_avg,
    }));

    // Cache for 1 minute
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

    return res.status(200).json({
      history,
      count: history.length,
      source: 'supabase',
    });
  } catch (error) {
    console.error('Error fetching rental history:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
