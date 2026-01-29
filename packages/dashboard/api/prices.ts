import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Hardware Prices API
 *
 * In production, this endpoint returns an error indicating that
 * real price data requires the oracle service backend.
 *
 * Simulated data has been removed - only real scraped data is shown.
 */

export default function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return error indicating real data requires backend
  return res.status(503).json({
    error: 'Real-time price data unavailable',
    message: 'Hardware price tracking requires the oracle service backend with live scrapers. Deploy the oracle-service or run locally with `pnpm dev` to see real prices.',
    prices: null,
    timestamp: Date.now(),
  });
}
