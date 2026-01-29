import axios, { AxiosInstance } from 'axios';
import type { PriceAdapter, PricePoint } from './types.js';
import type { AssetId, Config } from '../config/index.js';
import { ASSET_SEARCH_TERMS, BESTBUY_CATEGORY_IDS } from '../config/index.js';
import { AdapterError } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('bestbuy-adapter');

interface BestBuyProduct {
  sku: number;
  name: string;
  salePrice: number;
  regularPrice: number;
  onSale: boolean;
  url: string;
  inStoreAvailability: boolean;
  onlineAvailability: boolean;
  manufacturer: string;
}

interface BestBuySearchResponse {
  products: BestBuyProduct[];
  total: number;
  totalPages: number;
}

export class BestBuyAdapter implements PriceAdapter {
  readonly name = 'bestbuy';
  private client: AxiosInstance;

  constructor(private config: Config['apis']['bestbuy']) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
    });
  }

  isAvailable(): boolean {
    return !!this.config.apiKey;
  }

  async fetchPrices(assetId: AssetId): Promise<PricePoint[]> {
    if (!this.isAvailable()) {
      logger.warn('Best Buy adapter not configured, skipping');
      return [];
    }

    const searchTerms = ASSET_SEARCH_TERMS[assetId];
    const categoryId = BESTBUY_CATEGORY_IDS[assetId];
    const prices: PricePoint[] = [];

    try {
      for (const term of searchTerms) {
        // Build search query - filter by category and search term
        const searchQuery = this.buildSearchQuery(term, categoryId, assetId);

        const response = await this.client.get<BestBuySearchResponse>(
          '/products',
          {
            params: {
              apiKey: this.config.apiKey,
              format: 'json',
              show: 'sku,name,salePrice,regularPrice,onSale,url,inStoreAvailability,onlineAvailability,manufacturer',
              pageSize: 20,
              ...searchQuery,
            },
          }
        );

        for (const product of response.data.products) {
          // Only include available products
          if (!product.inStoreAvailability && !product.onlineAvailability) {
            continue;
          }

          const price = product.salePrice || product.regularPrice;
          if (price <= 0) continue;

          prices.push({
            price,
            source: this.name,
            timestamp: Date.now(),
            assetId,
            metadata: {
              productName: product.name,
              seller: 'Best Buy',
              condition: 'new',
              url: product.url,
            },
          });
        }
      }

      logger.info(`Fetched ${prices.length} prices for ${assetId} from Best Buy`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'FETCH_FAILED', `Failed to fetch prices for ${assetId}`, error);
    }
  }

  private buildSearchQuery(
    term: string,
    categoryId: string,
    assetId: AssetId
  ): Record<string, string> {
    // Build Best Buy query filter
    // Documentation: https://bestbuyapis.github.io/api-documentation

    const filters: string[] = [];

    // Search in product name
    filters.push(`(search=${encodeURIComponent(term)})`);

    // Category filter
    filters.push(`(categoryPath.id=${categoryId})`);

    // Price range filters based on asset type
    if (assetId.startsWith('GPU_')) {
      filters.push('(salePrice>=500)'); // GPUs typically $500+
    } else if (assetId.startsWith('RAM_')) {
      filters.push('(salePrice>=50)'); // RAM typically $50+
    }

    return {
      // Best Buy uses a special filter syntax
      '(': filters.join('&'),
    };
  }
}
