import axios, { AxiosInstance } from 'axios';
import type { PriceAdapter, PricePoint } from './types.js';
import type { AssetId, Config } from '../config/index.js';
import { ASSET_SEARCH_TERMS } from '../config/index.js';
import { AdapterError } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ebay-adapter');

interface EbayItemSummary {
  itemId: string;
  title: string;
  price: {
    value: string;
    currency: string;
  };
  condition: string;
  itemWebUrl: string;
  seller?: {
    username: string;
  };
}

interface EbaySearchResponse {
  itemSummaries?: EbayItemSummary[];
  total: number;
}

export class EbayAdapter implements PriceAdapter {
  readonly name = 'ebay';
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(private config: Config['apis']['ebay']) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
    });
  }

  isAvailable(): boolean {
    return !!(this.config.appId && this.config.certId);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.config.appId || !this.config.certId) {
      throw new AdapterError(this.name, 'AUTH_MISSING', 'eBay credentials not configured');
    }

    const credentials = Buffer.from(`${this.config.appId}:${this.config.certId}`).toString('base64');

    try {
      const response = await axios.post(
        'https://api.ebay.com/identity/v1/oauth2/token',
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (error) {
      throw new AdapterError(this.name, 'AUTH_FAILED', 'Failed to obtain eBay access token', error);
    }
  }

  async fetchPrices(assetId: AssetId): Promise<PricePoint[]> {
    if (!this.isAvailable()) {
      logger.warn('eBay adapter not configured, skipping');
      return [];
    }

    const searchTerms = ASSET_SEARCH_TERMS[assetId];
    const prices: PricePoint[] = [];

    try {
      const token = await this.getAccessToken();

      for (const term of searchTerms) {
        const response = await this.client.get<EbaySearchResponse>(
          '/buy/browse/v1/item_summary/search',
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            },
            params: {
              q: term,
              filter: 'conditions:{NEW},deliveryCountry:US,price:[100..],buyingOptions:{FIXED_PRICE}',
              sort: 'price',
              limit: 20,
            },
          }
        );

        if (response.data.itemSummaries) {
          for (const item of response.data.itemSummaries) {
            if (item.price.currency !== 'USD') continue;

            const price = parseFloat(item.price.value);
            if (isNaN(price) || price <= 0) continue;

            prices.push({
              price,
              source: this.name,
              timestamp: Date.now(),
              assetId,
              metadata: {
                productName: item.title,
                seller: item.seller?.username,
                condition: item.condition?.toLowerCase().includes('new') ? 'new' : 'used',
                url: item.itemWebUrl,
              },
            });
          }
        }
      }

      logger.info(`Fetched ${prices.length} prices for ${assetId} from eBay`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'FETCH_FAILED', `Failed to fetch prices for ${assetId}`, error);
    }
  }
}
