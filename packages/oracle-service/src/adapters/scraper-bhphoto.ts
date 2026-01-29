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
  sleep,
  getRandomDelay,
  isScraperApiConfigured,
  fetchViaScraperApi,
} from './scraper-utils.js';
import type { ScraperAdapterOptions } from './scraper-newegg.js';

const logger = createLogger('bhphoto-scraper');

// B&H Photo search URLs
const SEARCH_URLS: Record<AssetId, string> = {
  GPU_RTX4090: 'https://www.bhphotovideo.com/c/search?q=rtx%204090&sts=ma',
  GPU_RTX4080: 'https://www.bhphotovideo.com/c/search?q=rtx%204080&sts=ma',
  GPU_RTX3090: 'https://www.bhphotovideo.com/c/search?q=rtx%203090&sts=ma',
  RAM_DDR5_32: 'https://www.bhphotovideo.com/c/search?q=ddr5%2032gb&sts=ma',
  RAM_DDR5_64: 'https://www.bhphotovideo.com/c/search?q=ddr5%2064gb&sts=ma',
};

export class BHPhotoScraperAdapter implements PriceAdapter {
  readonly name = 'bhphoto-scraper';
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
      let htmlData: string;

      // Use ScraperAPI if configured
      if (isScraperApiConfigured()) {
        logger.info(`Using ScraperAPI for B&H Photo ${assetId}`);
        const response = await fetchViaScraperApi(url, {
          renderJs: false,
          country: 'us',
        });

        if (response.status !== 200) {
          throw new AdapterError(this.name, 'SCRAPER_API_ERROR', `ScraperAPI returned ${response.status}`);
        }

        htmlData = response.data;
      } else {
        // Direct scraping fallback
        // B&H is generally more permissive but still warm up
        await this.client.get('https://www.bhphotovideo.com/', {
          headers: getBrowserHeaders(),
        });

        await sleep(getRandomDelay(800, 1500));

        const response = await this.client.get(url, {
          headers: {
            ...getBrowserHeaders('https://www.bhphotovideo.com/'),
          },
        });

        if (response.status !== 200) {
          throw new AdapterError(this.name, 'HTTP_ERROR', `B&H returned ${response.status}`);
        }

        htmlData = response.data;
      }

      const $ = cheerio.load(htmlData);

      // B&H product listing selectors
      $('[data-selenium="miniProductPage"]').each((_, element) => {
        try {
          const $item = $(element);

          const name = $item.find('[data-selenium="miniProductPageName"]').text().trim() ||
                      $item.find('.productTitle').text().trim();

          if (!name || !this.isRelevantProduct(name, assetId)) return;

          // Extract price
          const priceText = $item.find('[data-selenium="miniProductPagePrice"]').text() ||
                           $item.find('.price').text();

          const price = this.parsePrice(priceText);
          if (!price || price < 50) return;

          // Check stock status
          const stockText = $item.find('[data-selenium="stockStatus"]').text().toLowerCase();
          if (stockText.includes('special order') || stockText.includes('back-order')) {
            // Still include but note condition
          }

          const productUrl = $item.find('a[data-selenium="miniProductPageProductNameLink"]').attr('href') ||
                            $item.find('a.productLink').attr('href');

          prices.push({
            price,
            source: this.name,
            timestamp: Date.now(),
            assetId,
            metadata: {
              productName: name,
              seller: 'B&H Photo',
              condition: 'new',
              url: productUrl ? `https://www.bhphotovideo.com${productUrl}` : undefined,
            },
          });
        } catch (e) {
          // Skip individual item errors
        }
      });

      // Also try alternative layout selectors
      if (prices.length === 0) {
        $('[data-selenium="miniProductPageWrapper"], .product-card').each((_, element) => {
          try {
            const $item = $(element);
            const name = $item.find('[class*="title"], .product-name').text().trim();

            if (!name || !this.isRelevantProduct(name, assetId)) return;

            const priceText = $item.find('[class*="price"]').first().text();
            const price = this.parsePrice(priceText);

            if (!price || price < 50) return;

            prices.push({
              price,
              source: this.name,
              timestamp: Date.now(),
              assetId,
              metadata: {
                productName: name,
                seller: 'B&H Photo',
                condition: 'new',
              },
            });
          } catch (e) {
            // Skip
          }
        });
      }

      logger.info(`Scraped ${prices.length} prices for ${assetId} from B&H Photo`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'SCRAPE_FAILED', `Failed to scrape ${assetId}`, error);
    }
  }

  private parsePrice(priceText: string): number | null {
    if (!priceText) return null;
    const match = priceText.match(/\$?([\d,]+\.?\d*)/);
    if (!match) return null;
    const price = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(price) ? null : price;
  }

  private isRelevantProduct(name: string, assetId: AssetId): boolean {
    const nameLower = name.toLowerCase();

    // Exclude accessories
    const excludeTerms = ['cable', 'adapter', 'dock', 'enclosure', 'cooler only', 'waterblock'];
    if (excludeTerms.some(term => nameLower.includes(term))) {
      return false;
    }

    switch (assetId) {
      case 'GPU_RTX4090':
        return nameLower.includes('4090') && (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'GPU_RTX4080':
        return nameLower.includes('4080') && (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'GPU_RTX3090':
        return nameLower.includes('3090') && (nameLower.includes('geforce') || nameLower.includes('rtx'));
      case 'RAM_DDR5_32':
        return nameLower.includes('ddr5') && (nameLower.includes('32gb') || nameLower.includes('32 gb'));
      case 'RAM_DDR5_64':
        return nameLower.includes('ddr5') && (nameLower.includes('64gb') || nameLower.includes('64 gb'));
      default:
        return false;
    }
  }
}
