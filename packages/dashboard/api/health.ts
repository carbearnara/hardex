import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    assets: ['GPU_RTX4090', 'GPU_RTX4080', 'GPU_RTX3090', 'RAM_DDR5_32', 'RAM_DDR5_64'],
    mode: 'demo',
  });
}
