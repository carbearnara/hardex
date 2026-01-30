import express, { Request, Response, NextFunction } from 'express';
import type { PriceAggregator } from '../aggregator/index.js';
import type { AssetId } from '../config/index.js';
import { ASSET_IDS } from '../config/index.js';
import {
  validateRequest,
  buildSuccessResponse,
  buildErrorResponse,
  type ChainlinkRequest,
} from './response.js';
import { rentalRouter } from '../api/rental.js';
import { createLogger } from '../utils/logger.js';
import { getHardwareHistory, getSupabase } from '../storage/supabase.js';
import { fetchViaScraperApi, isScraperApiConfigured } from '../adapters/scraper-utils.js';
import * as cheerio from 'cheerio';

const logger = createLogger('chainlink-adapter');

export interface AdapterOptions {
  port: number;
  aggregator: PriceAggregator;
}

export function createChainlinkAdapter(options: AdapterOptions): express.Application {
  const { aggregator } = options;
  const app = express();

  // Middleware
  app.use(express.json());

  // CORS middleware - allow dashboard to fetch from this API
  app.use((req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = [
      'https://dashboard-mocha-seven-59.vercel.app',
      'http://localhost:5173',
      'http://localhost:3000',
    ];
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      assets: ASSET_IDS,
      scraperApi: !!process.env.SCRAPER_API_KEY,
    });
  });

  // Force refresh prices (triggers immediate scrape)
  app.post('/refresh', async (_req: Request, res: Response) => {
    try {
      logger.info('Manual price refresh triggered');
      const updates = await aggregator.updateAllPrices();
      res.json({
        success: true,
        updated: updates.length,
        assets: updates.map(u => ({
          assetId: u.assetId,
          price: u.price.price,
          sources: u.price.sources,
        })),
      });
    } catch (error) {
      logger.error(`Refresh failed: ${error}`);
      res.status(500).json({ error: 'Refresh failed' });
    }
  });

  // Debug endpoint to test ScraperAPI
  app.get('/debug/scraper', async (_req: Request, res: Response) => {
    if (!isScraperApiConfigured()) {
      return res.json({ error: 'ScraperAPI not configured' });
    }

    try {
      const testUrl = 'https://www.newegg.com/p/pl?d=rtx+4090&N=100007709';
      const result = await fetchViaScraperApi(testUrl, { country: 'us' });

      const html = typeof result.data === 'string' ? result.data : '';

      // Check for various product selectors
      const selectors = {
        'item-cell': html.includes('item-cell'),
        'item-container': html.includes('item-container'),
        'goods-container': html.includes('goods-container'),
        'product-price': html.includes('product-price'),
        'price-current': html.includes('price-current'),
        'item-title': html.includes('item-title'),
        'item-info': html.includes('item-info'),
      };

      // Try to find price patterns
      const priceMatches = html.match(/\$[\d,]+\.?\d*/g)?.slice(0, 10) || [];

      // Find any JSON-LD data
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      const hasJsonLd = !!jsonLdMatch;

      // Try to actually parse items like the scraper does
      const $ = cheerio.load(html);
      const items: { name: string; price: string; priceNum: number }[] = [];

      $('.item-cell, .item-container').each((_, element) => {
        const $item = $(element);
        const name = $item.find('.item-title, a.item-title').first().text().trim();

        // Get price
        const priceStrong = $item.find('.price-current strong').text();
        const priceSup = $item.find('.price-current sup').text();
        const priceText = $item.find('.price-current').text();

        let priceNum = 0;
        if (priceStrong) {
          const dollars = priceStrong.replace(/[^0-9]/g, '');
          const cents = priceSup.replace(/[^0-9]/g, '') || '00';
          priceNum = parseFloat(`${dollars}.${cents}`);
        }

        if (name && name.length > 10) {
          items.push({
            name: name.substring(0, 80),
            price: priceText.substring(0, 20),
            priceNum,
          });
        }
      });

      res.json({
        status: result.status,
        dataLength: html.length,
        selectors,
        itemsFound: items.length,
        items: items.slice(0, 5),
        priceMatches,
      });
    } catch (error) {
      res.json({ error: String(error) });
    }
  });

  // GPU Rental pricing routes
  app.use('/rental', rentalRouter);

  // Get all prices (convenience endpoint)
  app.get('/prices', (_req: Request, res: Response) => {
    const prices = aggregator.getAllPrices();
    const result: Record<string, unknown> = {};

    for (const [assetId, price] of prices) {
      result[assetId] = {
        price: price.price,
        twap: price.twap,
        priceInt: price.priceInt.toString(),
        sourceCount: price.sourceCount,
        timestamp: price.timestamp,
        currency: price.currency,
        sources: price.sources,
      };
    }

    res.json({
      prices: result,
      timestamp: Date.now(),
    });
  });

  // Get hardware price history
  app.get('/prices/history', async (req: Request, res: Response) => {
    if (!getSupabase()) {
      return res.status(503).json({
        error: 'History storage not configured',
        message: 'Supabase is not configured for hardware price history.',
      });
    }

    const { assetId, startTime, endTime, limit } = req.query;

    try {
      const history = await getHardwareHistory(
        assetId as string | undefined,
        startTime ? parseInt(startTime as string, 10) : undefined,
        endTime ? parseInt(endTime as string, 10) : undefined,
        limit ? parseInt(limit as string, 10) : 1000
      );

      const formatted = history.map((record) => ({
        assetId: record.asset_id,
        timestamp: record.timestamp,
        price: record.price,
        twap: record.twap,
        sourceCount: record.source_count,
      }));

      res.json({
        history: formatted,
        count: formatted.length,
        source: 'supabase',
      });
    } catch (error) {
      logger.error(`Failed to fetch hardware history: ${error}`);
      res.status(500).json({ error: 'Failed to fetch hardware history' });
    }
  });

  // Get single asset price (convenience endpoint)
  app.get('/price/:assetId', (req: Request, res: Response) => {
    const assetId = req.params.assetId as AssetId;

    if (!ASSET_IDS.includes(assetId)) {
      res.status(400).json({
        error: 'Invalid asset ID',
        validAssets: ASSET_IDS,
      });
      return;
    }

    const price = aggregator.getPrice(assetId);

    if (!price) {
      res.status(404).json({
        error: 'Price not available',
        assetId,
      });
      return;
    }

    res.json({
      assetId,
      price: price.price,
      twap: price.twap,
      priceInt: price.priceInt.toString(),
      sourceCount: price.sourceCount,
      timestamp: price.timestamp,
      currency: price.currency,
      sources: price.sources,
    });
  });

  // Chainlink External Adapter endpoint (POST /price)
  app.post('/price', (req: Request, res: Response) => {
    const validated = validateRequest(req.body);

    if (!validated) {
      res.status(400).json(
        buildErrorResponse('0', 400, 'Invalid request format')
      );
      return;
    }

    const { id, data } = validated;

    // Get asset ID from request data
    const assetId = (data.assetId || data.asset) as AssetId | undefined;

    if (!assetId) {
      res.status(400).json(
        buildErrorResponse(id, 400, 'Missing asset or assetId in data')
      );
      return;
    }

    if (!ASSET_IDS.includes(assetId)) {
      res.status(400).json(
        buildErrorResponse(id, 400, `Invalid asset ID: ${assetId}. Valid: ${ASSET_IDS.join(', ')}`)
      );
      return;
    }

    const price = aggregator.getPrice(assetId);

    if (!price) {
      res.status(404).json(
        buildErrorResponse(id, 404, `Price not available for ${assetId}`)
      );
      return;
    }

    logger.info(`Chainlink request for ${assetId}: ${price.priceInt.toString()}`);
    res.json(buildSuccessResponse(id, price));
  });

  // Batch price request (for multiple assets)
  app.post('/prices', (req: Request, res: Response) => {
    const validated = validateRequest(req.body);

    if (!validated) {
      res.status(400).json(
        buildErrorResponse('0', 400, 'Invalid request format')
      );
      return;
    }

    const { id, data } = validated;

    // Get asset IDs from request
    let assetIds: AssetId[] = [];

    if (Array.isArray(data.assets)) {
      assetIds = data.assets as AssetId[];
    } else if (Array.isArray(data.assetIds)) {
      assetIds = data.assetIds as AssetId[];
    } else {
      // Return all assets
      assetIds = [...ASSET_IDS];
    }

    // Validate all asset IDs
    const invalidAssets = assetIds.filter(a => !ASSET_IDS.includes(a));
    if (invalidAssets.length > 0) {
      res.status(400).json(
        buildErrorResponse(id, 400, `Invalid asset IDs: ${invalidAssets.join(', ')}`)
      );
      return;
    }

    // Collect prices
    const results: Record<string, { price: number; priceInt: string; twap: number }> = {};

    for (const assetId of assetIds) {
      const price = aggregator.getPrice(assetId);
      if (price) {
        results[assetId] = {
          price: price.price,
          priceInt: price.priceInt.toString(),
          twap: price.twap,
        };
      }
    }

    res.json({
      jobRunID: id,
      statusCode: 200,
      data: {
        result: results,
        timestamp: Date.now(),
      },
    });
  });

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json(
      buildErrorResponse('0', 500, 'Internal server error')
    );
  });

  return app;
}

export function startAdapter(
  app: express.Application,
  port: number
): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, () => {
      logger.info(`Chainlink adapter listening on port ${port}`);
      resolve();
    });
  });
}
