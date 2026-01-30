import type { VercelRequest, VercelResponse } from '@vercel/node';

const ORACLE_SERVICE_URL = process.env.ORACLE_SERVICE_URL || 'https://hardex-production.up.railway.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Forward query params to Railway
    const queryParams = new URLSearchParams();
    if (req.query.assetId) queryParams.set('assetId', req.query.assetId as string);
    if (req.query.startTime) queryParams.set('startTime', req.query.startTime as string);
    if (req.query.endTime) queryParams.set('endTime', req.query.endTime as string);
    if (req.query.limit) queryParams.set('limit', req.query.limit as string);

    const url = `${ORACLE_SERVICE_URL}/prices/history?${queryParams.toString()}`;

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Oracle service returned ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json(data);
  } catch (error) {
    console.error('Failed to fetch hardware history:', error);

    return res.status(503).json({
      error: 'Hardware history unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
      history: [],
      count: 0,
    });
  }
}
