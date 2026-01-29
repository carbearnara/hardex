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
  isScraperApiConfigured,
  fetchViaScraperApi,
} from './scraper-utils.js';
import type { ScraperAdapterOptions } from './scraper-newegg.js';

const logger = createLogger('bestbuy-scraper');

// Best Buy internal API endpoint (used by their frontend)
const API_BASE = 'https://www.bestbuy.com/api/tcfb/model.json';

// Search queries for each asset
const SEARCH_QUERIES: Record<AssetId, { query: string; categoryId: string }> = {
  GPU_RTX4090: { query: 'rtx 4090', categoryId: 'abcat0507002' },
  GPU_RTX4080: { query: 'rtx 4080', categoryId: 'abcat0507002' },
  GPU_RTX3090: { query: 'rtx 3090', categoryId: 'abcat0507002' },
  RAM_DDR5_32: { query: 'ddr5 32gb', categoryId: 'abcat0507012' },
  RAM_DDR5_64: { query: 'ddr5 64gb', categoryId: 'abcat0507012' },
};

// Fallback: HTML search URLs
const SEARCH_URLS: Record<AssetId, string> = {
  GPU_RTX4090: 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+4090&cp=1',
  GPU_RTX4080: 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+4080&cp=1',
  GPU_RTX3090: 'https://www.bestbuy.com/site/searchpage.jsp?st=rtx+3090&cp=1',
  RAM_DDR5_32: 'https://www.bestbuy.com/site/searchpage.jsp?st=ddr5+32gb&cp=1',
  RAM_DDR5_64: 'https://www.bestbuy.com/site/searchpage.jsp?st=ddr5+64gb&cp=1',
};

export class BestBuyScraperAdapter implements PriceAdapter {
  readonly name = 'bestbuy-scraper';
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
    // Try API first, fall back to HTML scraping
    try {
      const prices = await this.fetchFromAPI(assetId);
      if (prices.length > 0) return prices;
    } catch (e) {
      logger.debug(`API fetch failed for ${assetId}, trying HTML scrape`);
    }

    // Random delay before HTML scraping
    await sleep(getRandomDelay(1000, 2500));

    return this.fetchFromHTML(assetId);
  }

  private async fetchFromAPI(assetId: AssetId): Promise<PricePoint[]> {
    const { query, categoryId } = SEARCH_QUERIES[assetId];
    const prices: PricePoint[] = [];

    // Best Buy's internal API parameters
    const params = new URLSearchParams({
      paths: JSON.stringify([
        ['shop', 'search', 'query', query],
      ]),
      method: 'get',
    });

    const url = `${API_BASE}?${params}`;

    try {
      const response = await this.client.get(url, {
        headers: {
          ...getBrowserHeaders('https://www.bestbuy.com/'),
          'Accept': 'application/json',
          'Cookie': generateSessionCookies('bestbuy.com'),
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.status !== 200 || !response.data) {
        throw new Error(`API returned ${response.status}`);
      }

      // Parse API response (structure may vary)
      const data = response.data;
      const products = data?.jsonGraph?.shop?.search?.query?.[query]?.value?.products || [];

      for (const product of products) {
        if (!product.name || !product.pricing) continue;

        const price = product.pricing.current || product.pricing.regular;
        if (!price || price < 50) continue;

        if (!this.isRelevantProduct(product.name, assetId)) continue;

        prices.push({
          price,
          source: this.name,
          timestamp: Date.now(),
          assetId,
          metadata: {
            productName: product.name,
            seller: 'Best Buy',
            condition: 'new',
            url: product.url ? `https://www.bestbuy.com${product.url}` : undefined,
          },
        });
      }

      logger.info(`API: Fetched ${prices.length} prices for ${assetId} from Best Buy`);
      return prices;
    } catch (error) {
      throw new AdapterError(this.name, 'API_FAILED', 'Best Buy API request failed', error);
    }
  }

  private async fetchFromHTML(assetId: AssetId): Promise<PricePoint[]> {
    const url = SEARCH_URLS[assetId];
    const prices: PricePoint[] = [];

    try {
      let htmlData: string;

      // Use ScraperAPI if configured
      if (isScraperApiConfigured()) {
        logger.info(`Using ScraperAPI for Best Buy ${assetId}`);
        const response = await fetchViaScraperApi(url, {
          renderJs: true, // Best Buy needs JS rendering
          country: 'us',
        });

        if (response.status !== 200) {
          throw new AdapterError(this.name, 'SCRAPER_API_ERROR', `ScraperAPI returned ${response.status}`);
        }

        htmlData = response.data;
      } else {
        // Direct scraping fallback
        // First, visit homepage to establish session
        await this.client.get('https://www.bestbuy.com/', {
          headers: getBrowserHeaders(),
        });

        await sleep(getRandomDelay(800, 1500));

        // Now fetch search results
        const response = await fetchWithRetry(
          this.client,
          url,
          {
            headers: {
              ...getBrowserHeaders('https://www.bestbuy.com/'),
              'Cookie': generateSessionCookies('bestbuy.com'),
            },
          },
          3
        );

        if (response.status === 403) {
          throw new AdapterError(this.name, 'BLOCKED', 'Best Buy blocked the request');
        }

        htmlData = response.data;
      }

      const $ = cheerio.load(htmlData);

      // Try multiple selector patterns
      const selectors = [
        '.sku-item',
        '[data-sku-id]',
        '.list-item',
        '.product-item',
      ];

      for (const selector of selectors) {
        $(selector).each((_, element) => {
          try {
            const $item = $(element);
            const price = this.extractPrice($item, $);
            const name = this.extractName($item, $);

            if (!name || !price || price < 50) return;
            if (!this.isRelevantProduct(name, assetId)) return;

            const productUrl = $item.find('a.image-link, a[href*="/site/"]').first().attr('href');

            prices.push({
              price,
              source: this.name,
              timestamp: Date.now(),
              assetId,
              metadata: {
                productName: name,
                seller: 'Best Buy',
                condition: 'new',
                url: productUrl?.startsWith('http') ? productUrl : `https://www.bestbuy.com${productUrl}`,
              },
            });
          } catch (e) {
            // Skip individual item errors
          }
        });

        if (prices.length > 0) break;
      }

      logger.info(`HTML: Scraped ${prices.length} prices for ${assetId} from Best Buy`);
      return prices;
    } catch (error) {
      if (error instanceof AdapterError) throw error;
      throw new AdapterError(this.name, 'SCRAPE_FAILED', `Failed to scrape ${assetId}`, error);
    }
  }

  private extractPrice($item: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): number | null {
    // Try multiple price selectors
    const priceSelectors = [
      '[data-testid="customer-price"] span',
      '.priceView-customer-price span',
      '.pricing-price__regular-price',
      '.priceView-hero-price span',
      '[class*="price"] span',
    ];

    for (const selector of priceSelectors) {
      const priceText = $item.find(selector).first().text();
      if (priceText) {
        const price = this.parsePrice(priceText);
        if (price) return price;
      }
    }

    return null;
  }

  private extractName($item: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string | null {
    const nameSelectors = [
      '.sku-title a',
      '.sku-header a',
      'h4.sku-title',
      '[data-testid="sku-title"]',
      '.product-title',
    ];

    for (const selector of nameSelectors) {
      const name = $item.find(selector).text().trim();
      if (name) return name;
    }

    return null;
  }

  private isRelevantProduct(name: string, assetId: AssetId): boolean {
    const nameLower = name.toLowerCase();

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

  private parsePrice(priceText: string): number | null {
    if (!priceText) return null;
    const cleaned = priceText.replace(/[^0-9.]/g, '');
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }
}
