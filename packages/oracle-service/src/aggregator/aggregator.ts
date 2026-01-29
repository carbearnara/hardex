import type { PriceAdapter, PricePoint } from '../adapters/types.js';
import type { AssetId, Config } from '../config/index.js';
import { ASSET_IDS } from '../config/index.js';
import { filterOutliers, median } from './outlier.js';
import { TWAPCalculator } from './twap.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('aggregator');

export interface SourceDetail {
  name: string;
  price: number;
  count: number;
  isSimulated: boolean;
}

export interface AggregatedPrice {
  assetId: AssetId;
  price: number;            // Aggregated price in USD
  twap: number;             // Time-weighted average price
  priceInt: bigint;         // Price with 8 decimals (Chainlink format)
  sourceCount: number;      // Number of sources contributing
  timestamp: number;        // Unix timestamp in ms
  updatedAt: number;        // Last update time
  currency: string;         // Currency code
  sources: SourceDetail[];  // Details about each source
}

export interface PriceUpdate {
  assetId: AssetId;
  price: AggregatedPrice;
  changed: boolean;         // Whether price changed significantly
}

export class PriceAggregator {
  private adapters: PriceAdapter[];
  private twapCalculator: TWAPCalculator;
  private lastPrices: Map<AssetId, AggregatedPrice> = new Map();
  private priceChangeThreshold: number;

  constructor(
    adapters: PriceAdapter[],
    config: Config
  ) {
    this.adapters = adapters;
    this.twapCalculator = new TWAPCalculator(config.twapWindowMs);
    this.priceChangeThreshold = config.priceChangeThreshold;
  }

  /**
   * Fetch and aggregate prices for all assets
   */
  async updateAllPrices(): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];

    for (const assetId of ASSET_IDS) {
      try {
        const update = await this.updatePrice(assetId);
        updates.push(update);
      } catch (error) {
        logger.error(`Failed to update price for ${assetId}: ${error}`);
      }
    }

    return updates;
  }

  /**
   * Fetch and aggregate price for a single asset
   */
  async updatePrice(assetId: AssetId): Promise<PriceUpdate> {
    // Fetch from all adapters in parallel
    const fetchPromises = this.adapters.map(adapter =>
      adapter.fetchPrices(assetId).catch(error => {
        logger.warn(`Adapter ${adapter.name} failed: ${error}`);
        return [] as PricePoint[];
      })
    );

    const results = await Promise.all(fetchPromises);
    const allPrices = results.flat();

    logger.debug(`Collected ${allPrices.length} raw prices for ${assetId}`);

    // Filter outliers
    const filteredPrices = filterOutliers(allPrices);
    logger.debug(`After outlier filtering: ${filteredPrices.length} prices`);

    // Calculate median price
    const medianPrice = filteredPrices.length > 0
      ? median(filteredPrices.map(p => p.price))
      : 0;

    // Update TWAP
    if (medianPrice > 0) {
      this.twapCalculator.addObservation(assetId, medianPrice);
    }

    const twap = this.twapCalculator.getTWAP(assetId) || medianPrice;

    // Aggregate source details
    const sourceMap = new Map<string, { prices: number[]; isSimulated: boolean }>();
    for (const p of filteredPrices) {
      const existing = sourceMap.get(p.source) || { prices: [], isSimulated: p.source === 'mock' };
      existing.prices.push(p.price);
      sourceMap.set(p.source, existing);
    }

    const sources: SourceDetail[] = Array.from(sourceMap.entries()).map(([name, data]) => ({
      name: this.formatSourceName(name),
      price: median(data.prices),
      count: data.prices.length,
      isSimulated: data.isSimulated,
    }));

    // Create aggregated price
    const aggregatedPrice: AggregatedPrice = {
      assetId,
      price: medianPrice,
      twap,
      priceInt: this.toPriceInt(medianPrice),
      sourceCount: sources.length,
      timestamp: Date.now(),
      updatedAt: Date.now(),
      currency: 'USD',
      sources,
    };

    // Check if price changed significantly
    const lastPrice = this.lastPrices.get(assetId);
    const changed = this.isPriceChangeSignificant(lastPrice?.price, medianPrice);

    // Store latest price
    this.lastPrices.set(assetId, aggregatedPrice);

    logger.info(
      `${assetId}: $${medianPrice.toFixed(2)} (TWAP: $${twap.toFixed(2)}) ` +
      `from ${aggregatedPrice.sourceCount} sources` +
      (changed ? ' [CHANGED]' : '')
    );

    return { assetId, price: aggregatedPrice, changed };
  }

  /**
   * Get the latest aggregated price for an asset
   */
  getPrice(assetId: AssetId): AggregatedPrice | null {
    return this.lastPrices.get(assetId) || null;
  }

  /**
   * Get all latest prices
   */
  getAllPrices(): Map<AssetId, AggregatedPrice> {
    return new Map(this.lastPrices);
  }

  /**
   * Check if price change exceeds threshold
   */
  private isPriceChangeSignificant(
    oldPrice: number | undefined,
    newPrice: number
  ): boolean {
    if (oldPrice === undefined || oldPrice === 0) return true;
    if (newPrice === 0) return false;

    const changePercent = Math.abs(newPrice - oldPrice) / oldPrice;
    return changePercent >= this.priceChangeThreshold;
  }

  /**
   * Convert USD price to 8-decimal integer (Chainlink format)
   * Example: $1599.99 -> 159999000000n
   */
  private toPriceInt(price: number): bigint {
    return BigInt(Math.round(price * 1e8));
  }

  /**
   * Format source name for display
   */
  private formatSourceName(name: string): string {
    const nameMap: Record<string, string> = {
      'mock': 'Simulated',
      'bestbuy-scraper': 'Best Buy',
      'newegg-scraper': 'Newegg',
      'amazon-scraper': 'Amazon',
      'bhphoto-scraper': 'B&H Photo',
      'ebay': 'eBay',
      'amazon': 'Amazon API',
      'bestbuy': 'Best Buy API',
    };
    return nameMap[name] || name;
  }
}
