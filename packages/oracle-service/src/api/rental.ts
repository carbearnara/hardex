/**
 * GPU Rental Price API Endpoint
 *
 * Provides real-time GPU rental pricing data from multiple sources:
 * - Vast.ai marketplace
 * - RunPod (future)
 * - Lambda Labs (future)
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import {
  vastaiAdapter,
  type RentalGpuType,
  type RentalPriceStats,
} from '../adapters/rental-vastai.js';
import {
  storeRentalPrices,
  getRentalHistory,
  getStorageStats,
  getSupabase,
} from '../storage/supabase.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('rental-api');
const router = Router();

// Cache for rental data
let rentalCache: {
  data: Record<RentalGpuType, RentalPriceStats>;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 60000; // 1 minute cache

const VALID_GPU_TYPES: RentalGpuType[] = [
  'RTX_4090',
  'RTX_3090',
  'A100_80GB',
  'A100_40GB',
  'H100_80GB',
  'H100_PCIE',
  'A6000',
  'L40S',
];

/**
 * GET /rental/prices
 * Returns current rental prices for all tracked GPUs
 */
router.get('/prices', async (_req: Request, res: Response) => {
  try {
    // Check cache
    if (rentalCache && Date.now() - rentalCache.timestamp < CACHE_TTL_MS) {
      return res.json({
        prices: rentalCache.data,
        timestamp: rentalCache.timestamp,
        cached: true,
      });
    }

    // Fetch fresh data
    const prices = await vastaiAdapter.getAllPriceStats();
    const timestamp = Date.now();

    // Update cache
    rentalCache = {
      data: prices,
      timestamp,
    };

    // Store in Supabase (async, don't block response)
    const records = Object.entries(prices).map(([gpuType, stats]) => ({
      gpu_type: gpuType,
      timestamp,
      avg_price: stats.avgPrice,
      min_price: stats.minPrice,
      max_price: stats.maxPrice,
      offer_count: stats.offerCount,
      interruptible_avg: stats.interruptibleAvg,
      on_demand_avg: stats.onDemandAvg,
    }));

    storeRentalPrices(records).catch((err) => {
      logger.error('Failed to store prices in Supabase:', err);
    });

    res.json({
      prices,
      timestamp,
      cached: false,
    });
  } catch (error) {
    logger.error(`Failed to fetch rental prices: ${error}`);
    res.status(500).json({ error: 'Failed to fetch rental prices' });
  }
});

/**
 * GET /rental/prices/:gpuType
 * Returns rental price for a specific GPU type
 */
router.get('/prices/:gpuType', async (req: Request, res: Response) => {
  const gpuType = req.params.gpuType as RentalGpuType;

  if (!VALID_GPU_TYPES.includes(gpuType)) {
    return res.status(400).json({
      error: 'Invalid GPU type',
      validTypes: VALID_GPU_TYPES,
    });
  }

  try {
    const stats = await vastaiAdapter.getPriceStats(gpuType);
    res.json({
      stats,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error(`Failed to fetch rental price for ${gpuType}: ${error}`);
    res.status(500).json({ error: 'Failed to fetch rental price' });
  }
});

/**
 * GET /rental/offers/:gpuType
 * Returns all available offers for a GPU type
 */
router.get('/offers/:gpuType', async (req: Request, res: Response) => {
  const gpuType = req.params.gpuType as RentalGpuType;

  try {
    const offers = await vastaiAdapter.searchOffers(gpuType);
    res.json({
      offers,
      count: offers.length,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error(`Failed to fetch offers for ${gpuType}: ${error}`);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

/**
 * GET /rental/history
 * Returns historical rental prices from Supabase
 * Query params: gpuType, startTime, endTime, limit
 */
router.get('/history', async (req: Request, res: Response) => {
  const { gpuType, startTime, endTime, limit } = req.query;

  if (!getSupabase()) {
    return res.status(503).json({
      error: 'History storage not configured',
      message: 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    });
  }

  try {
    const history = await getRentalHistory(
      gpuType as string | undefined,
      startTime ? parseInt(startTime as string, 10) : undefined,
      endTime ? parseInt(endTime as string, 10) : undefined,
      limit ? parseInt(limit as string, 10) : 1000
    );

    // Transform to match frontend format
    const formatted = history.map((record) => ({
      gpuType: record.gpu_type,
      timestamp: record.timestamp,
      avgPrice: record.avg_price,
      minPrice: record.min_price,
      maxPrice: record.max_price,
      offerCount: record.offer_count,
      interruptibleAvg: record.interruptible_avg,
      onDemandAvg: record.on_demand_avg,
    }));

    res.json({
      history: formatted,
      count: formatted.length,
    });
  } catch (error) {
    logger.error(`Failed to fetch rental history: ${error}`);
    res.status(500).json({ error: 'Failed to fetch rental history' });
  }
});

/**
 * GET /rental/history/stats
 * Returns storage statistics
 */
router.get('/history/stats', async (_req: Request, res: Response) => {
  if (!getSupabase()) {
    return res.status(503).json({
      error: 'History storage not configured',
    });
  }

  try {
    const stats = await getStorageStats();
    res.json(stats);
  } catch (error) {
    logger.error(`Failed to fetch storage stats: ${error}`);
    res.status(500).json({ error: 'Failed to fetch storage stats' });
  }
});

export { router as rentalRouter };
