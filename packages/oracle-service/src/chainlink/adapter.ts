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
