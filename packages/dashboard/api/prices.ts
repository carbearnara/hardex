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
    // Fetch from the Railway oracle service
    const response = await fetch(`${ORACLE_SERVICE_URL}/prices`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Oracle service returned ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json({
      ...data,
      source: 'oracle-service',
    });
  } catch (error) {
    console.error('Failed to fetch from oracle service:', error);

    return res.status(503).json({
      error: 'Oracle service unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
      prices: null,
      timestamp: Date.now(),
    });
  }
}
