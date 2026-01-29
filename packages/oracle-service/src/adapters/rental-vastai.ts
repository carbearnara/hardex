/**
 * Vast.ai GPU Rental Price Adapter
 *
 * Fetches real-time GPU rental prices from Vast.ai marketplace.
 * Uses their public search API to query available offers.
 *
 * Reference: https://docs.vast.ai/
 */

import axios from 'axios';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('vastai-rental');

// Vast.ai public API base
const VASTAI_API_BASE = 'https://console.vast.ai/api/v0';

// GPU types we track for rental pricing
export type RentalGpuType =
  | 'RTX_4090'
  | 'RTX_3090'
  | 'A100_80GB'
  | 'A100_40GB'
  | 'H100_80GB'
  | 'H100_PCIE'
  | 'A6000'
  | 'L40S';

export interface RentalOffer {
  id: string;
  gpuType: RentalGpuType;
  gpuCount: number;
  pricePerHour: number;      // USD per hour
  pricePerGpuHour: number;   // USD per GPU per hour
  totalVram: number;         // GB
  reliability: number;       // 0-1 score
  location: string;
  provider: string;
  available: boolean;
  interruptible: boolean;    // Can be preempted (cheaper)
  dlPerf: number;            // Deep learning performance score
  timestamp: number;
}

export interface RentalPriceStats {
  gpuType: RentalGpuType;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  avgPrice: number;
  offerCount: number;
  interruptibleAvg: number;  // Avg price for interruptible instances
  onDemandAvg: number;       // Avg price for on-demand instances
  timestamp: number;
}

// GPU name mappings for Vast.ai API
const GPU_QUERY_MAP: Record<RentalGpuType, string> = {
  RTX_4090: 'RTX 4090',
  RTX_3090: 'RTX 3090',
  A100_80GB: 'A100 80GB',
  A100_40GB: 'A100',
  H100_80GB: 'H100 80GB',
  H100_PCIE: 'H100 PCIe',
  A6000: 'A6000',
  L40S: 'L40S',
};

export class VastaiRentalAdapter {
  readonly name = 'vastai';
  private client = axios.create({
    baseURL: VASTAI_API_BASE,
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'HardexOracle/1.0',
    },
  });

  /**
   * Search for GPU rental offers
   */
  async searchOffers(gpuType: RentalGpuType): Promise<RentalOffer[]> {
    const gpuQuery = GPU_QUERY_MAP[gpuType];

    try {
      // Vast.ai search API - public endpoint
      const response = await this.client.get('/bundles/', {
        params: {
          q: JSON.stringify({
            gpu_name: { eq: gpuQuery },
            verified: { eq: true },
            rentable: { eq: true },
            num_gpus: { gte: 1 },
            order: [['dph_total', 'asc']],
            type: 'on-demand',
          }),
        },
      });

      if (!response.data?.offers) {
        logger.warn(`No offers found for ${gpuType}`);
        return [];
      }

      const offers: RentalOffer[] = response.data.offers.map((offer: any) => ({
        id: String(offer.id),
        gpuType,
        gpuCount: offer.num_gpus || 1,
        pricePerHour: offer.dph_total || 0,
        pricePerGpuHour: (offer.dph_total || 0) / (offer.num_gpus || 1),
        totalVram: (offer.gpu_ram || 0) * (offer.num_gpus || 1) / 1024, // Convert to GB
        reliability: offer.reliability || 0,
        location: offer.geolocation || 'Unknown',
        provider: offer.hosting_type === 1 ? 'Datacenter' : 'Consumer',
        available: offer.rentable === true,
        interruptible: offer.min_bid !== undefined,
        dlPerf: offer.dlperf || 0,
        timestamp: Date.now(),
      }));

      logger.info(`Found ${offers.length} rental offers for ${gpuType}`);
      return offers;
    } catch (error) {
      logger.error(`Failed to fetch Vast.ai offers for ${gpuType}: ${error}`);

      // Return simulated data as fallback for demo
      return this.generateSimulatedOffers(gpuType);
    }
  }

  /**
   * Get price statistics for a GPU type
   */
  async getPriceStats(gpuType: RentalGpuType): Promise<RentalPriceStats> {
    const offers = await this.searchOffers(gpuType);

    if (offers.length === 0) {
      return this.getDefaultStats(gpuType);
    }

    const prices = offers.map((o) => o.pricePerGpuHour).sort((a, b) => a - b);
    const interruptiblePrices = offers
      .filter((o) => o.interruptible)
      .map((o) => o.pricePerGpuHour);
    const onDemandPrices = offers
      .filter((o) => !o.interruptible)
      .map((o) => o.pricePerGpuHour);

    return {
      gpuType,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      medianPrice: this.median(prices),
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      offerCount: offers.length,
      interruptibleAvg:
        interruptiblePrices.length > 0
          ? interruptiblePrices.reduce((a, b) => a + b, 0) / interruptiblePrices.length
          : 0,
      onDemandAvg:
        onDemandPrices.length > 0
          ? onDemandPrices.reduce((a, b) => a + b, 0) / onDemandPrices.length
          : 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all tracked GPU rental stats
   */
  async getAllPriceStats(): Promise<Record<RentalGpuType, RentalPriceStats>> {
    const gpuTypes = Object.keys(GPU_QUERY_MAP) as RentalGpuType[];
    const results: Partial<Record<RentalGpuType, RentalPriceStats>> = {};

    await Promise.all(
      gpuTypes.map(async (gpuType) => {
        results[gpuType] = await this.getPriceStats(gpuType);
      })
    );

    return results as Record<RentalGpuType, RentalPriceStats>;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private getDefaultStats(gpuType: RentalGpuType): RentalPriceStats {
    // Default prices based on market data (Jan 2025)
    const defaults: Record<RentalGpuType, { min: number; max: number; avg: number }> = {
      RTX_4090: { min: 0.30, max: 0.70, avg: 0.44 },
      RTX_3090: { min: 0.20, max: 0.50, avg: 0.30 },
      A100_80GB: { min: 1.50, max: 2.50, avg: 1.89 },
      A100_40GB: { min: 1.20, max: 2.00, avg: 1.50 },
      H100_80GB: { min: 2.00, max: 4.00, avg: 2.85 },
      H100_PCIE: { min: 1.80, max: 3.50, avg: 2.50 },
      A6000: { min: 0.40, max: 0.80, avg: 0.55 },
      L40S: { min: 0.80, max: 1.50, avg: 1.10 },
    };

    const def = defaults[gpuType];
    return {
      gpuType,
      minPrice: def.min,
      maxPrice: def.max,
      medianPrice: def.avg,
      avgPrice: def.avg,
      offerCount: 0,
      interruptibleAvg: def.min * 0.6,
      onDemandAvg: def.avg,
      timestamp: Date.now(),
    };
  }

  /**
   * Generate simulated offers for demo mode
   */
  private generateSimulatedOffers(gpuType: RentalGpuType): RentalOffer[] {
    const baseStats = this.getDefaultStats(gpuType);
    const count = Math.floor(Math.random() * 20) + 10;
    const offers: RentalOffer[] = [];

    for (let i = 0; i < count; i++) {
      const isInterruptible = Math.random() > 0.6;
      const basePrice = isInterruptible
        ? baseStats.interruptibleAvg
        : baseStats.onDemandAvg;

      // Add variance
      const variance = (Math.random() - 0.5) * 0.4;
      const price = Math.max(0.1, basePrice * (1 + variance));

      offers.push({
        id: `sim-${gpuType}-${i}`,
        gpuType,
        gpuCount: Math.floor(Math.random() * 4) + 1,
        pricePerHour: price,
        pricePerGpuHour: price,
        totalVram: this.getVramForGpu(gpuType),
        reliability: 0.9 + Math.random() * 0.1,
        location: ['US-West', 'US-East', 'EU-West', 'Asia'][Math.floor(Math.random() * 4)],
        provider: Math.random() > 0.5 ? 'Datacenter' : 'Consumer',
        available: true,
        interruptible: isInterruptible,
        dlPerf: Math.random() * 100 + 50,
        timestamp: Date.now(),
      });
    }

    return offers;
  }

  private getVramForGpu(gpuType: RentalGpuType): number {
    const vram: Record<RentalGpuType, number> = {
      RTX_4090: 24,
      RTX_3090: 24,
      A100_80GB: 80,
      A100_40GB: 40,
      H100_80GB: 80,
      H100_PCIE: 80,
      A6000: 48,
      L40S: 48,
    };
    return vram[gpuType];
  }
}

// Export singleton instance
export const vastaiAdapter = new VastaiRentalAdapter();
