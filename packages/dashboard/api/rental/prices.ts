import type { VercelRequest, VercelResponse } from '@vercel/node';

// GPU rental types
type RentalGpuType =
  | 'RTX_4090'
  | 'RTX_3090'
  | 'A100_80GB'
  | 'A100_40GB'
  | 'H100_80GB'
  | 'H100_PCIE'
  | 'A6000'
  | 'L40S';

interface RentalPriceStats {
  gpuType: RentalGpuType;
  minPrice: number;
  maxPrice: number;
  medianPrice: number;
  avgPrice: number;
  offerCount: number;
  interruptibleAvg: number;
  onDemandAvg: number;
  timestamp: number;
}

// Market-based pricing data (Jan 2025)
// Source: Vast.ai, RunPod, Lambda Labs market analysis
const GPU_PRICING: Record<RentalGpuType, {
  baseMin: number;
  baseMax: number;
  baseAvg: number;
  interruptibleDiscount: number;
  volatility: number;
  typicalOffers: number;
}> = {
  RTX_4090: {
    baseMin: 0.30,
    baseMax: 0.70,
    baseAvg: 0.44,
    interruptibleDiscount: 0.4,
    volatility: 0.1,
    typicalOffers: 150,
  },
  RTX_3090: {
    baseMin: 0.18,
    baseMax: 0.45,
    baseAvg: 0.28,
    interruptibleDiscount: 0.45,
    volatility: 0.12,
    typicalOffers: 200,
  },
  A100_40GB: {
    baseMin: 1.10,
    baseMax: 2.00,
    baseAvg: 1.45,
    interruptibleDiscount: 0.35,
    volatility: 0.08,
    typicalOffers: 80,
  },
  A100_80GB: {
    baseMin: 1.50,
    baseMax: 2.50,
    baseAvg: 1.89,
    interruptibleDiscount: 0.35,
    volatility: 0.08,
    typicalOffers: 60,
  },
  H100_80GB: {
    baseMin: 2.00,
    baseMax: 4.00,
    baseAvg: 2.85,
    interruptibleDiscount: 0.3,
    volatility: 0.1,
    typicalOffers: 40,
  },
  H100_PCIE: {
    baseMin: 1.80,
    baseMax: 3.50,
    baseAvg: 2.50,
    interruptibleDiscount: 0.32,
    volatility: 0.1,
    typicalOffers: 35,
  },
  A6000: {
    baseMin: 0.35,
    baseMax: 0.75,
    baseAvg: 0.52,
    interruptibleDiscount: 0.4,
    volatility: 0.1,
    typicalOffers: 100,
  },
  L40S: {
    baseMin: 0.75,
    baseMax: 1.40,
    baseAvg: 1.05,
    interruptibleDiscount: 0.35,
    volatility: 0.1,
    typicalOffers: 50,
  },
};

function generatePriceStats(gpuType: RentalGpuType): RentalPriceStats {
  const config = GPU_PRICING[gpuType];

  // Add market variation based on time
  const hourOfDay = new Date().getUTCHours();
  // Prices tend to be slightly lower during off-peak hours (US nighttime)
  const timeMultiplier = hourOfDay >= 4 && hourOfDay <= 12 ? 0.97 : 1.02;

  // Random market fluctuation
  const marketNoise = 1 + (Math.random() - 0.5) * config.volatility;

  const avgPrice = config.baseAvg * timeMultiplier * marketNoise;
  const minPrice = config.baseMin * marketNoise;
  const maxPrice = config.baseMax * marketNoise;

  // Median typically between avg and min
  const medianPrice = (avgPrice + minPrice) / 2;

  // Interruptible pricing
  const interruptibleAvg = avgPrice * (1 - config.interruptibleDiscount);

  // On-demand slightly above average
  const onDemandAvg = avgPrice * 1.1;

  // Offer count varies
  const offerCount = Math.floor(
    config.typicalOffers * (0.8 + Math.random() * 0.4)
  );

  return {
    gpuType,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    medianPrice: Math.round(medianPrice * 100) / 100,
    avgPrice: Math.round(avgPrice * 100) / 100,
    offerCount,
    interruptibleAvg: Math.round(interruptibleAvg * 100) / 100,
    onDemandAvg: Math.round(onDemandAvg * 100) / 100,
    timestamp: Date.now(),
  };
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  // Generate prices for all GPUs
  const gpuTypes = Object.keys(GPU_PRICING) as RentalGpuType[];
  const prices: Record<RentalGpuType, RentalPriceStats> = {} as Record<
    RentalGpuType,
    RentalPriceStats
  >;

  for (const gpuType of gpuTypes) {
    prices[gpuType] = generatePriceStats(gpuType);
  }

  res.status(200).json({
    prices,
    timestamp: Date.now(),
    cached: false,
    source: 'simulated',
    note: 'Prices based on Vast.ai market data patterns',
  });
}
