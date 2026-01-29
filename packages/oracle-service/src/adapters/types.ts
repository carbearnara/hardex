import type { AssetId } from '../config/index.js';

export interface PricePoint {
  price: number;        // Price in USD
  source: string;       // Source identifier (e.g., 'ebay', 'amazon')
  timestamp: number;    // Unix timestamp in ms
  assetId: AssetId;
  metadata?: {
    productName?: string;
    seller?: string;
    condition?: 'new' | 'used' | 'refurbished';
    url?: string;
  };
}

export interface PriceAdapter {
  readonly name: string;

  /**
   * Fetch current prices for an asset
   * @returns Array of price points from this source
   */
  fetchPrices(assetId: AssetId): Promise<PricePoint[]>;

  /**
   * Check if the adapter is configured and available
   */
  isAvailable(): boolean;
}

export interface AdapterConfig {
  enabled: boolean;
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

export class AdapterError extends Error {
  constructor(
    public readonly adapter: string,
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[${adapter}] ${message}`);
    this.name = 'AdapterError';
  }
}
