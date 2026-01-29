export type AssetId =
  | 'GPU_RTX4090'
  | 'GPU_RTX4080'
  | 'GPU_RTX3090'
  | 'RAM_DDR5_32'
  | 'RAM_DDR5_64';

export interface SourceInfo {
  name: string;
  price: number;
  isSimulated: boolean;
}

export interface PriceData {
  price: number;
  twap: number;
  priceInt: string;
  sourceCount: number;
  timestamp: number;
  currency: string;
  sources: SourceInfo[];
}

export interface PricesResponse {
  prices: Record<AssetId, PriceData>;
  timestamp: number;
}

export interface HealthResponse {
  status: string;
  timestamp: number;
  assets: AssetId[];
}

export interface PriceHistory {
  timestamp: number;
  price: number;
  twap: number;
}

export interface AssetInfo {
  id: AssetId;
  name: string;
  category: 'GPU' | 'RAM';
  icon: string;
  description: string;
}

export const ASSETS: AssetInfo[] = [
  {
    id: 'GPU_RTX4090',
    name: 'RTX 4090',
    category: 'GPU',
    icon: 'gpu',
    description: 'NVIDIA GeForce RTX 4090',
  },
  {
    id: 'GPU_RTX4080',
    name: 'RTX 4080',
    category: 'GPU',
    icon: 'gpu',
    description: 'NVIDIA GeForce RTX 4080',
  },
  {
    id: 'GPU_RTX3090',
    name: 'RTX 3090',
    category: 'GPU',
    icon: 'gpu',
    description: 'NVIDIA GeForce RTX 3090',
  },
  {
    id: 'RAM_DDR5_32',
    name: 'DDR5 32GB',
    category: 'RAM',
    icon: 'memory',
    description: 'DDR5 RAM 32GB Kit',
  },
  {
    id: 'RAM_DDR5_64',
    name: 'DDR5 64GB',
    category: 'RAM',
    icon: 'memory',
    description: 'DDR5 RAM 64GB Kit',
  },
];

// GPU Rental Types
export type RentalGpuType =
  | 'RTX_4090'
  | 'RTX_3090'
  | 'A100_80GB'
  | 'A100_40GB'
  | 'H100_80GB'
  | 'H100_PCIE'
  | 'A6000'
  | 'L40S';

export interface RentalPriceStats {
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

export interface RentalPricesResponse {
  prices: Record<RentalGpuType, RentalPriceStats>;
  timestamp: number;
  cached: boolean;
}

export interface RentalGpuInfo {
  id: RentalGpuType;
  name: string;
  vram: number;
  tier: 'consumer' | 'datacenter';
  description: string;
}

export const RENTAL_GPUS: RentalGpuInfo[] = [
  {
    id: 'RTX_4090',
    name: 'RTX 4090',
    vram: 24,
    tier: 'consumer',
    description: 'Best consumer GPU for AI inference',
  },
  {
    id: 'RTX_3090',
    name: 'RTX 3090',
    vram: 24,
    tier: 'consumer',
    description: 'Previous gen consumer flagship',
  },
  {
    id: 'A100_40GB',
    name: 'A100 40GB',
    vram: 40,
    tier: 'datacenter',
    description: 'Datacenter GPU for training',
  },
  {
    id: 'A100_80GB',
    name: 'A100 80GB',
    vram: 80,
    tier: 'datacenter',
    description: 'High-memory datacenter GPU',
  },
  {
    id: 'H100_80GB',
    name: 'H100 80GB',
    vram: 80,
    tier: 'datacenter',
    description: 'Latest datacenter flagship',
  },
  {
    id: 'H100_PCIE',
    name: 'H100 PCIe',
    vram: 80,
    tier: 'datacenter',
    description: 'H100 PCIe variant',
  },
  {
    id: 'A6000',
    name: 'A6000',
    vram: 48,
    tier: 'datacenter',
    description: 'Professional workstation GPU',
  },
  {
    id: 'L40S',
    name: 'L40S',
    vram: 48,
    tier: 'datacenter',
    description: 'Inference-optimized datacenter GPU',
  },
];
