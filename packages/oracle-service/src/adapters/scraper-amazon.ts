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
} from './scraper-utils.js';
import type { ScraperAdapterOptions } from './scraper-newegg.js';

const logger = createLogger('amazon-scraper');

// Amazon search URLs
const SEARCH_URLS: Record<AssetId, string> = {
  GPU_RTX4090: 'https://www.amazon.com/s?k=rtx+4090+graphics+card&rh=n%3A284822',
  GPU_RTX4080: 'https://www.amazon.com/s?k=rtx+4080+graphics+card&rh=n%3A284822',
  GPU_RTX3090: 'https://www.amazon.com/s?k=rtx+3090+graphics+card&rh=n%3A284822',
  RAM_DDR5_32: 'https://www.amazon.com/s?k=ddr5+32gb+ram&rh=n%3A172500',
  RAM_DDR5_64: 'https://www.amazon.com/s?k=ddr5+64gb+ram&rh=n%3A172500',
};

export class AmazonScraperAdapter implements PriceAdapter {
  readonly name = 'amazon-scraper';
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
      // Amazon is aggressive about blocking - warm up with homepage
      await this.client.get('https://www.amazon.com/', {
        headers: {
          ...getBrowserHeaders(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
      });

      await sleep(getRandomDelay(1500, 3000));

      // Now try search
      const response = await this.client.get(url, {
        headers: {
          ...getBrowserHeaders('https://www.amazon.com/'),
          'Cookie': this.generateAmazonCookies(),
        },
        maxRedirects: 5,
      });

      // Check if we got a CAPTCHA or block
      if (response.status !== 200) {
        throw new AdapterError(this.name, 'BLOCKED', `Amazon returned ${response.status}`);
      }

      const html = response.data;
      if (html.includes('Enter the characters you see below') ||
          html.includes('api-services-support@amazon.com')) {
        throw new AdapterError(this.name, 'CAPTCHA', 'Amazon CAPTCHA detected');
      }

      const $ = cheerio.load(html);

      // Amazon search result selectors
      $('[data-component-type="s-search-result"]').each((_, element) => {
        try {
          const $item = $(element);

          // Skip sponsored results
          if ($item.find('[data-component-type="sp-sponsored-result"]').length > 0) {
            return;
          }

          const name = $item.find('h2 a span').text().trim() ||
                      $item.find('.a-text-normal').first().text().trim();

          if (!name || !this.isRelevantProduct(name, assetId)) return;

          // Extract price
          const priceWhole = $item.find('.a-price-whole').first().text().replace(/[^0-9]/g, '');
          const priceFraction = $item.find('.a-price-fraction').first().text().replace(/[^0-9]/g, '') || '00';

          if (!priceWhole) return;

          const price = parseFloat(`${priceWhole}.${priceFraction}`);
          if (!price || price < 50) return;

          const productUrl = $item.find('h2 a').attr('href');

          prices.push({
            price,
            source: this.name,
            timestamp: Date.now(),
            assetId,
            metadata: {
              productName: name,
              seller: 'Amazon',
              condition: 'new',
              url: productUrl ? `https://www.amazon.com${productUrl}` : undefined,
            },
          });
        } catch (e) {
          // Skip individual item errors
        }
      });

      logger.info(`Scraped ${prices.length} prices for ${assetId} from Amazon`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'SCRAPE_FAILED', `Failed to scrape ${assetId}`, error);
    }
  }

  private generateAmazonCookies(): string {
    const sessionId = Math.random().toString(36).substring(2, 20);
    const ubid = `${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 12)}`;

    return [
      `session-id=${sessionId}`,
      `ubid-main=${ubid}`,
      `session-token=null`,
      `i18n-prefs=USD`,
      `sp-cdn="L5Z9:US"`,
    ].join('; ');
  }

  private isRelevantProduct(name: string, assetId: AssetId): boolean {
    const nameLower = name.toLowerCase();

    // Exclude accessories
    const excludeTerms = ['cable', 'adapter', 'mount', 'stand', 'case', 'bag', 'cooler only'];
    if (excludeTerms.some(term => nameLower.includes(term))) {
      return false;
    }

    switch (assetId) {
      case 'GPU_RTX4090':
        return nameLower.includes('4090') &&
               (nameLower.includes('geforce') || nameLower.includes('rtx') || nameLower.includes('nvidia'));
      case 'GPU_RTX4080':
        return nameLower.includes('4080') &&
               (nameLower.includes('geforce') || nameLower.includes('rtx') || nameLower.includes('nvidia'));
      case 'GPU_RTX3090':
        return nameLower.includes('3090') &&
               (nameLower.includes('geforce') || nameLower.includes('rtx') || nameLower.includes('nvidia'));
      case 'RAM_DDR5_32':
        return nameLower.includes('ddr5') && nameLower.includes('32');
      case 'RAM_DDR5_64':
        return nameLower.includes('ddr5') && nameLower.includes('64');
      default:
        return false;
    }
  }
}
