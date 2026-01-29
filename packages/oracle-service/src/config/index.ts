import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const AssetIdSchema = z.enum([
  'GPU_RTX4090',
  'GPU_RTX4080',
  'GPU_RTX3090',
  'RAM_DDR5_32',
  'RAM_DDR5_64',
]);

export type AssetId = z.infer<typeof AssetIdSchema>;

export const ASSET_IDS = AssetIdSchema.options;

const ConfigSchema = z.object({
  port: z.coerce.number().default(8080),
  updateIntervalMs: z.coerce.number().default(30000),
  priceChangeThreshold: z.coerce.number().default(0.005),
  twapWindowMs: z.coerce.number().default(300000),
  apis: z.object({
    ebay: z.object({
      appId: z.string().optional(),
      certId: z.string().optional(),
      baseUrl: z.string().default('https://api.ebay.com'),
    }),
    amazon: z.object({
      accessKey: z.string().optional(),
      secretKey: z.string().optional(),
      partnerTag: z.string().optional(),
      region: z.string().default('us-east-1'),
    }),
    bestbuy: z.object({
      apiKey: z.string().optional(),
      baseUrl: z.string().default('https://api.bestbuy.com/v1'),
    }),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    port: process.env.PORT,
    updateIntervalMs: process.env.UPDATE_INTERVAL_MS,
    priceChangeThreshold: process.env.PRICE_CHANGE_THRESHOLD,
    twapWindowMs: process.env.TWAP_WINDOW_MS,
    apis: {
      ebay: {
        appId: process.env.EBAY_APP_ID,
        certId: process.env.EBAY_CERT_ID,
        baseUrl: process.env.EBAY_BASE_URL,
      },
      amazon: {
        accessKey: process.env.AMAZON_ACCESS_KEY,
        secretKey: process.env.AMAZON_SECRET_KEY,
        partnerTag: process.env.AMAZON_PARTNER_TAG,
        region: process.env.AMAZON_REGION,
      },
      bestbuy: {
        apiKey: process.env.BESTBUY_API_KEY,
        baseUrl: process.env.BESTBUY_BASE_URL,
      },
    },
  });
}

// Asset search terms for each API
export const ASSET_SEARCH_TERMS: Record<AssetId, string[]> = {
  GPU_RTX4090: ['NVIDIA RTX 4090', 'GeForce RTX 4090'],
  GPU_RTX4080: ['NVIDIA RTX 4080', 'GeForce RTX 4080'],
  GPU_RTX3090: ['NVIDIA RTX 3090', 'GeForce RTX 3090'],
  RAM_DDR5_32: ['DDR5 32GB', 'DDR5 RAM 32GB Kit'],
  RAM_DDR5_64: ['DDR5 64GB', 'DDR5 RAM 64GB Kit'],
};

// Best Buy SKU mappings (approximate category IDs)
export const BESTBUY_CATEGORY_IDS: Record<AssetId, string> = {
  GPU_RTX4090: 'pcmcat182300050006',
  GPU_RTX4080: 'pcmcat182300050006',
  GPU_RTX3090: 'pcmcat182300050006',
  RAM_DDR5_32: 'pcmcat158500050008',
  RAM_DDR5_64: 'pcmcat158500050008',
};
