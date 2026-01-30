import { loadConfig } from './config/index.js';
import { createAdapters, createMockAdapters, createScraperAdapters } from './adapters/index.js';
import { PriceAggregator } from './aggregator/index.js';
import { createChainlinkAdapter, startAdapter } from './chainlink/index.js';
import { initSupabase, storeRentalPrices } from './storage/supabase.js';
import { vastaiAdapter } from './adapters/rental-vastai.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('main');

async function main() {
  logger.info('Starting Hardware Price Oracle Service');

  // Initialize Supabase for rental price history storage
  const supabase = initSupabase();
  if (supabase) {
    logger.info('Supabase initialized for rental price history');
  } else {
    logger.info('Supabase not configured - rental history will not be persisted');
  }

  // Check for mode
  const demoMode = process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1';
  const scrapeMode = process.env.SCRAPE_MODE === 'true' || process.env.SCRAPE_MODE === '1';

  // Load configuration
  const config = loadConfig();
  logger.info(`Configuration loaded. Port: ${config.port}`);

  // Create API adapters
  let adapters;

  if (scrapeMode) {
    logger.info('Running in SCRAPE MODE - fetching real prices from websites');
    adapters = createScraperAdapters();
  } else if (demoMode) {
    logger.info('Running in DEMO MODE with mock data');
    adapters = createMockAdapters();
  } else {
    adapters = createAdapters(config);

    if (adapters.length === 0) {
      logger.warn('No API adapters configured! Set API credentials in environment.');
      logger.warn('Try SCRAPE_MODE=true to scrape real prices without API keys.');
      logger.warn('Starting in DEMO MODE with mock data instead.');
      adapters = createMockAdapters();
    }
  }

  logger.info(`Initialized ${adapters.length} price adapters: ${adapters.map(a => a.name).join(', ')}`)

  // Create price aggregator
  const aggregator = new PriceAggregator(adapters, config);

  // Create and start Chainlink adapter
  const app = createChainlinkAdapter({
    port: config.port,
    aggregator,
  });

  await startAdapter(app, config.port);

  // Initial price fetch
  logger.info('Performing initial price fetch...');
  await aggregator.updateAllPrices();

  // Set up periodic price updates for hardware
  const updateInterval = setInterval(async () => {
    try {
      const updates = await aggregator.updateAllPrices();
      const changed = updates.filter(u => u.changed);
      if (changed.length > 0) {
        logger.info(`Price changes detected for: ${changed.map(u => u.assetId).join(', ')}`);
      }
    } catch (error) {
      logger.error(`Error updating prices: ${error}`);
    }
  }, config.updateIntervalMs);

  // Set up periodic rental price updates (every 5 minutes)
  const RENTAL_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

  const updateRentalPrices = async () => {
    try {
      logger.info('Fetching rental prices...');
      const prices = await vastaiAdapter.getAllPriceStats();
      const timestamp = Date.now();

      // Store in Supabase
      const records = Object.entries(prices).map(([gpuType, stats]) => ({
        gpu_type: gpuType,
        timestamp,
        avg_price: stats.avgPrice,
        min_price: stats.minPrice,
        max_price: stats.maxPrice,
        offer_count: stats.offerCount,
        interruptible_avg: stats.interruptibleAvg,
        on_demand_avg: stats.onDemandAvg,
      }));

      await storeRentalPrices(records);
      logger.info(`Stored ${records.length} rental price records to Supabase`);
    } catch (error) {
      logger.error(`Error updating rental prices: ${error}`);
    }
  };

  // Initial rental price fetch
  if (supabase) {
    logger.info('Performing initial rental price fetch...');
    await updateRentalPrices();
  }

  // Set up rental price update interval
  const rentalUpdateInterval = supabase
    ? setInterval(updateRentalPrices, RENTAL_UPDATE_INTERVAL_MS)
    : null;

  // Graceful shutdown
  const shutdown = () => {
    logger.info('Shutting down...');
    clearInterval(updateInterval);
    if (rentalUpdateInterval) {
      clearInterval(rentalUpdateInterval);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Oracle service is running');
}

main().catch((error) => {
  logger.error(`Fatal error: ${error}`);
  process.exit(1);
});
