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
import { createLogger } from '../utils/logger.js';

const logger = createLogger('rental-api');
const router = Router();

// Cache for rental data
let rentalCache: {
  data: Record<RentalGpuType, RentalPriceStats>;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 60000; // 1 minute cache

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

    // Update cache
    rentalCache = {
      data: prices,
      timestamp: Date.now(),
    };

    res.json({
      prices,
      timestamp: rentalCache.timestamp,
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

  const validTypes: RentalGpuType[] = [
    'RTX_4090',
    'RTX_3090',
    'A100_80GB',
    'A100_40GB',
    'H100_80GB',
    'H100_PCIE',
    'A6000',
    'L40S',
  ];

  if (!validTypes.includes(gpuType)) {
    return res.status(400).json({
      error: 'Invalid GPU type',
      validTypes,
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

export { router as rentalRouter };
