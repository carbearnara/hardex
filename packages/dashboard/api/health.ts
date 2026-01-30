import type { VercelRequest, VercelResponse } from '@vercel/node';

const ORACLE_SERVICE_URL = process.env.ORACLE_SERVICE_URL || 'https://hardex-production.up.railway.app';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Fetch health from Railway oracle service
    const response = await fetch(`${ORACLE_SERVICE_URL}/health`, {
      headers: { 'Accept': 'application/json' },
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
    // Fallback to local status if oracle service is unavailable
    return res.status(200).json({
      status: 'degraded',
      timestamp: Date.now(),
      assets: ['GPU_RTX4090', 'GPU_RTX4080', 'GPU_RTX3090', 'RAM_DDR5_32', 'RAM_DDR5_64'],
      mode: 'fallback',
      oracleError: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
