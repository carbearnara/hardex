import type { Config } from '../config/index.js';
import type { PriceAdapter } from './types.js';
import { EbayAdapter } from './ebay.js';
import { AmazonAdapter } from './amazon.js';
import { BestBuyAdapter } from './bestbuy.js';
import { MockAdapter } from './mock.js';
import { BestBuyScraperAdapter } from './scraper-bestbuy.js';
import { NeweggScraperAdapter } from './scraper-newegg.js';
import { AmazonScraperAdapter } from './scraper-amazon.js';
import { BHPhotoScraperAdapter } from './scraper-bhphoto.js';
import { initProxyPool } from './scraper-utils.js';

export * from './types.js';
export { initProxyPool } from './scraper-utils.js';
export { EbayAdapter } from './ebay.js';
export { AmazonAdapter } from './amazon.js';
export { BestBuyAdapter } from './bestbuy.js';
export { MockAdapter, createMockAdapter } from './mock.js';
export { BestBuyScraperAdapter } from './scraper-bestbuy.js';
export { NeweggScraperAdapter } from './scraper-newegg.js';
export { AmazonScraperAdapter } from './scraper-amazon.js';
export { BHPhotoScraperAdapter } from './scraper-bhphoto.js';

export function createAdapters(config: Config): PriceAdapter[] {
  const adapters: PriceAdapter[] = [
    new EbayAdapter(config.apis.ebay),
    new AmazonAdapter(config.apis.amazon),
    new BestBuyAdapter(config.apis.bestbuy),
  ];

  // Filter to only available adapters (those with valid config)
  return adapters.filter(adapter => adapter.isAvailable());
}

export interface ScraperOptions {
  useProxy?: boolean;
}

export function createScraperAdapters(options?: ScraperOptions): PriceAdapter[] {
  // Initialize proxy pool from environment if proxies are configured
  const useProxy = options?.useProxy ?? process.env.USE_PROXY === 'true';
  if (useProxy) {
    initProxyPool();
  }

  // Return all scraper adapters that don't need API keys
  return [
    new NeweggScraperAdapter({ useProxy }),
    new BestBuyScraperAdapter({ useProxy }),
    new AmazonScraperAdapter({ useProxy }),
    new BHPhotoScraperAdapter({ useProxy }),
  ];
}

export function createMockAdapters(): PriceAdapter[] {
  // Return mock adapter for demo mode
  return [new MockAdapter()];
}

export function createAllAdapters(config: Config): PriceAdapter[] {
  // Return all adapters regardless of availability (for testing)
  return [
    new EbayAdapter(config.apis.ebay),
    new AmazonAdapter(config.apis.amazon),
    new BestBuyAdapter(config.apis.bestbuy),
  ];
}
