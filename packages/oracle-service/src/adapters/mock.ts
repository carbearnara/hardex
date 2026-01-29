import type { PriceAdapter, PricePoint } from './types.js';
import type { AssetId } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mock-adapter');

// Base prices for each asset (realistic market prices)
const BASE_PRICES: Record<AssetId, number> = {
  GPU_RTX4090: 1599.99,
  GPU_RTX4080: 1199.99,
  GPU_RTX3090: 899.99,
  RAM_DDR5_32: 129.99,
  RAM_DDR5_64: 249.99,
};

// Track simulated prices with some volatility
const currentPrices: Record<AssetId, number> = { ...BASE_PRICES };

/**
 * Mock adapter that generates realistic-looking price data
 * for development and testing purposes.
 */
export class MockAdapter implements PriceAdapter {
  readonly name = 'mock';
  private volatility: number;

  constructor(volatility: number = 0.02) {
    this.volatility = volatility;
  }

  isAvailable(): boolean {
    return true;
  }

  async fetchPrices(assetId: AssetId): Promise<PricePoint[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 200 + 100));

    // Update price with random walk
    const currentPrice = currentPrices[assetId];
    const change = (Math.random() - 0.5) * 2 * this.volatility * currentPrice;
    const newPrice = Math.max(currentPrice + change, BASE_PRICES[assetId] * 0.8);
    currentPrices[assetId] = newPrice;

    // Generate multiple "listings" with slight variations
    const numListings = Math.floor(Math.random() * 5) + 3;
    const prices: PricePoint[] = [];

    for (let i = 0; i < numListings; i++) {
      // Add some variance between sellers
      const variance = (Math.random() - 0.5) * 0.1 * newPrice;
      const listingPrice = Math.round((newPrice + variance) * 100) / 100;

      prices.push({
        price: listingPrice,
        source: this.name,
        timestamp: Date.now(),
        assetId,
        metadata: {
          productName: this.generateProductName(assetId, i),
          seller: this.generateSellerName(),
          condition: 'new',
        },
      });
    }

    logger.debug(`Generated ${prices.length} mock prices for ${assetId}`);
    return prices;
  }

  private generateProductName(assetId: AssetId, index: number): string {
    const brands = ['ASUS', 'MSI', 'EVGA', 'Gigabyte', 'Zotac', 'PNY'];
    const brand = brands[index % brands.length];

    switch (assetId) {
      case 'GPU_RTX4090':
        return `${brand} GeForce RTX 4090 Gaming OC`;
      case 'GPU_RTX4080':
        return `${brand} GeForce RTX 4080 SUPER`;
      case 'GPU_RTX3090':
        return `${brand} GeForce RTX 3090 Ti`;
      case 'RAM_DDR5_32':
        return `${brand === 'ASUS' ? 'G.Skill' : 'Corsair'} DDR5 32GB (2x16GB) Kit`;
      case 'RAM_DDR5_64':
        return `${brand === 'ASUS' ? 'Kingston' : 'Crucial'} DDR5 64GB (2x32GB) Kit`;
      default:
        return `Unknown Product`;
    }
  }

  private generateSellerName(): string {
    const sellers = [
      'TechDeals',
      'HardwareHub',
      'PCPartsPro',
      'DigitalDirect',
      'ComputerWorld',
    ];
    return sellers[Math.floor(Math.random() * sellers.length)];
  }
}

/**
 * Create mock adapter for demo mode
 */
export function createMockAdapter(volatility?: number): MockAdapter {
  return new MockAdapter(volatility);
}
