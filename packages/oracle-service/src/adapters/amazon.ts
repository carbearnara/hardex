import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import type { PriceAdapter, PricePoint } from './types.js';
import type { AssetId, Config } from '../config/index.js';
import { ASSET_SEARCH_TERMS } from '../config/index.js';
import { AdapterError } from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('amazon-adapter');

interface AmazonItem {
  ASIN: string;
  ItemInfo?: {
    Title?: {
      DisplayValue: string;
    };
  };
  Offers?: {
    Listings?: Array<{
      Price?: {
        Amount: number;
        Currency: string;
      };
      Condition?: {
        Value: string;
      };
    }>;
  };
}

interface AmazonSearchResponse {
  SearchResult?: {
    Items?: AmazonItem[];
  };
}

export class AmazonAdapter implements PriceAdapter {
  readonly name = 'amazon';
  private client: AxiosInstance;

  constructor(private config: Config['apis']['amazon']) {
    this.client = axios.create({
      timeout: 10000,
    });
  }

  isAvailable(): boolean {
    return !!(this.config.accessKey && this.config.secretKey && this.config.partnerTag);
  }

  private signRequest(params: Record<string, string>, timestamp: string): string {
    if (!this.config.accessKey || !this.config.secretKey) {
      throw new AdapterError(this.name, 'AUTH_MISSING', 'Amazon credentials not configured');
    }

    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    const host = `webservices.amazon.com`;
    const path = '/paapi5/searchitems';

    const stringToSign = [
      'POST',
      host,
      path,
      sortedParams,
    ].join('\n');

    const hmac = crypto.createHmac('sha256', this.config.secretKey);
    hmac.update(stringToSign);
    return hmac.digest('base64');
  }

  async fetchPrices(assetId: AssetId): Promise<PricePoint[]> {
    if (!this.isAvailable()) {
      logger.warn('Amazon adapter not configured, skipping');
      return [];
    }

    const searchTerms = ASSET_SEARCH_TERMS[assetId];
    const prices: PricePoint[] = [];

    try {
      for (const term of searchTerms) {
        const timestamp = new Date().toISOString();

        const requestBody = {
          Keywords: term,
          Resources: [
            'ItemInfo.Title',
            'Offers.Listings.Price',
            'Offers.Listings.Condition',
          ],
          PartnerTag: this.config.partnerTag,
          PartnerType: 'Associates',
          Marketplace: 'www.amazon.com',
          ItemCount: 10,
        };

        const response = await this.client.post<AmazonSearchResponse>(
          `https://webservices.amazon.com/paapi5/searchitems`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Amz-Date': timestamp,
              'X-Amz-Target': 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
              'Authorization': this.buildAuthHeader(timestamp, requestBody),
            },
          }
        );

        const items = response.data.SearchResult?.Items || [];

        for (const item of items) {
          const listing = item.Offers?.Listings?.[0];
          if (!listing?.Price) continue;

          if (listing.Price.Currency !== 'USD') continue;

          const price = listing.Price.Amount;
          if (price <= 0) continue;

          prices.push({
            price,
            source: this.name,
            timestamp: Date.now(),
            assetId,
            metadata: {
              productName: item.ItemInfo?.Title?.DisplayValue,
              condition: listing.Condition?.Value === 'New' ? 'new' : 'used',
              url: `https://www.amazon.com/dp/${item.ASIN}`,
            },
          });
        }
      }

      logger.info(`Fetched ${prices.length} prices for ${assetId} from Amazon`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'FETCH_FAILED', `Failed to fetch prices for ${assetId}`, error);
    }
  }

  private buildAuthHeader(timestamp: string, body: object): string {
    // AWS Signature Version 4 signing
    // Simplified for illustration - production would need full SigV4
    const region = this.config.region || 'us-east-1';
    const service = 'ProductAdvertisingAPI';
    const dateStamp = timestamp.slice(0, 10).replace(/-/g, '');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');

    // Simplified - real implementation needs full canonical request
    return `${algorithm} Credential=${this.config.accessKey}/${credentialScope}, SignedHeaders=host;x-amz-date;x-amz-target, Signature=placeholder`;
  }
}
