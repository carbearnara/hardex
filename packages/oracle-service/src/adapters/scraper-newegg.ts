import * as cheerio from 'cheerio';
import type { AxiosInstance } from 'axios';
import type { PriceAdapter, PricePoint } from './types.js';
import type { AssetId } from '../config/index.js';
import { AdapterError } from './types.js';
import { createLogger } from '../utils/logger.js';
import {
  createStealthClient,
  createRotatingProxyClient,
  getBrowserHeaders,
  generateSessionCookies,
  fetchWithRetry,
  sleep,
  getRandomDelay,
} from './scraper-utils.js';

const logger = createLogger('newegg-scraper');

// Newegg search URLs for each asset
const SEARCH_URLS: Record<AssetId, string> = {
  GPU_RTX4090: 'https://www.newegg.com/p/pl?d=rtx+4090&N=100007709&PageSize=96',
  GPU_RTX4080: 'https://www.newegg.com/p/pl?d=rtx+4080&N=100007709&PageSize=96',
  GPU_RTX3090: 'https://www.newegg.com/p/pl?d=rtx+3090&N=100007709&PageSize=96',
  RAM_DDR5_32: 'https://www.newegg.com/p/pl?d=ddr5+32gb&N=100007611&PageSize=96',
  RAM_DDR5_64: 'https://www.newegg.com/p/pl?d=ddr5+64gb&N=100007611&PageSize=96',
};

export interface ScraperAdapterOptions {
  useProxy?: boolean;
}

export class NeweggScraperAdapter implements PriceAdapter {
  readonly name = 'newegg-scraper';
  private client: AxiosInstance;
  private useProxy: boolean;

  constructor(options?: ScraperAdapterOptions) {
    this.useProxy = options?.useProxy ?? false;
    this.client = this.useProxy
      ? createRotatingProxyClient()
      : createStealthClient();
  }

  isAvailable(): boolean {
    return true;
  }

  async fetchPrices(assetId: AssetId): Promise<PricePoint[]> {
    const url = SEARCH_URLS[assetId];
    const prices: PricePoint[] = [];

    try {
      // First establish session with homepage
      await this.client.get('https://www.newegg.com/', {
        headers: getBrowserHeaders(),
      });

      await sleep(getRandomDelay(500, 1200));

      // Fetch search results
      const response = await fetchWithRetry(
        this.client,
        url,
        {
          headers: {
            ...getBrowserHeaders('https://www.newegg.com/'),
            'Cookie': generateSessionCookies('newegg.com'),
          },
        },
        3
      );

      if (response.status === 403 || response.status === 429) {
        throw new AdapterError(this.name, 'BLOCKED', `Newegg returned ${response.status}`);
      }

      const $ = cheerio.load(response.data);

      // Newegg uses various layouts - try multiple selectors
      const itemSelectors = [
        '.item-cell',
        '.item-container',
        '[class*="item-cell"]',
        '.goods-container',
      ];

      for (const selector of itemSelectors) {
        $(selector).each((_, element) => {
          try {
            const $item = $(element);
            const itemData = this.extractItemData($item, $, assetId);

            if (itemData && this.isRelevantProduct(itemData.name, assetId)) {
              prices.push({
                price: itemData.price,
                source: this.name,
                timestamp: Date.now(),
                assetId,
                metadata: {
                  productName: itemData.name,
                  seller: 'Newegg',
                  condition: 'new',
                  url: itemData.url,
                },
              });
            }
          } catch (e) {
            // Skip individual item errors
          }
        });

        if (prices.length > 0) break;
      }

      // Also try JSON-LD data embedded in page
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || '');
          if (json['@type'] === 'Product' && json.offers) {
            const price = parseFloat(json.offers.price);
            if (price && price > 50 && this.isRelevantProduct(json.name, assetId)) {
              prices.push({
                price,
                source: this.name,
                timestamp: Date.now(),
                assetId,
                metadata: {
                  productName: json.name,
                  seller: 'Newegg',
                  condition: 'new',
                  url: json.url,
                },
              });
            }
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      });

      logger.info(`Scraped ${prices.length} prices for ${assetId} from Newegg`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'SCRAPE_FAILED', `Failed to scrape ${assetId}`, error);
    }
  }

  private extractItemData(
    $item: cheerio.Cheerio<any>,
    $: cheerio.CheerioAPI,
    assetId: AssetId
  ): { name: string; price: number; url?: string } | null {
    // Try to get name
    const nameSelectors = [
      '.item-title',
      'a.item-title',
      '.item-info a',
      '[class*="item-title"]',
    ];

    let name = '';
    for (const sel of nameSelectors) {
      name = $item.find(sel).text().trim();
      if (name) break;
    }

    if (!name) return null;

    // Get price - Newegg has various formats
    let price = 0;

    // Try current price
    const priceStrong = $item.find('.price-current strong').text();
    const priceSup = $item.find('.price-current sup').text();

    if (priceStrong) {
      // Format: "1,599" + "99" for $1,599.99
      const dollars = priceStrong.replace(/[^0-9]/g, '');
      const cents = priceSup.replace(/[^0-9]/g, '') || '00';
      price = parseFloat(`${dollars}.${cents}`);
    }

    // Fallback: try other price selectors
    if (!price || isNaN(price)) {
      const priceSelectors = [
        '.price-current',
        '[class*="price"]',
        '.price-was-data',
      ];

      for (const sel of priceSelectors) {
        const priceText = $item.find(sel).text();
        const match = priceText.match(/\$?([\d,]+\.?\d*)/);
        if (match) {
          price = parseFloat(match[1].replace(/,/g, ''));
          if (price && !isNaN(price)) break;
        }
      }
    }

    if (!price || isNaN(price) || price < 50) return null;

    // Check if out of stock
    const stockText = $item.text().toLowerCase();
    if (stockText.includes('out of stock') || stockText.includes('sold out')) {
      return null;
    }

    // Get URL
    const url = $item.find('.item-title').attr('href') ||
                $item.find('a.item-title').attr('href') ||
                $item.find('.item-info a').attr('href');

    return { name, price, url: url || undefined };
  }

  private isRelevantProduct(name: string, assetId: AssetId): boolean {
    const nameLower = name.toLowerCase();

    // Exclude accessories, cables, etc.
    const excludeTerms = ['cable', 'adapter', 'mount', 'bracket', 'cooler only', 'backplate'];
    if (excludeTerms.some(term => nameLower.includes(term))) {
      return false;
    }

    switch (assetId) {
      case 'GPU_RTX4090':
        return nameLower.includes('4090') && (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'GPU_RTX4080':
        return (nameLower.includes('4080') || nameLower.includes('4080 super')) &&
               (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'GPU_RTX3090':
        return nameLower.includes('3090') && (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'RAM_DDR5_32':
        return nameLower.includes('ddr5') &&
               (nameLower.includes('32gb') || nameLower.includes('32 gb') || nameLower.includes('2x16'));
      case 'RAM_DDR5_64':
        return nameLower.includes('ddr5') &&
               (nameLower.includes('64gb') || nameLower.includes('64 gb') || nameLower.includes('2x32'));
      default:
        return false;
    }
  }
}
