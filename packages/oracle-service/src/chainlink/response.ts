import type { AggregatedPrice } from '../aggregator/index.js';

/**
 * Chainlink External Adapter Request format
 * https://docs.chain.link/chainlink-nodes/external-adapters/external-adapters
 */
export interface ChainlinkRequest {
  id: string | number;
  data: {
    asset?: string;
    assetId?: string;
    // Additional parameters can be passed
    [key: string]: unknown;
  };
}

/**
 * Chainlink External Adapter Response format
 */
export interface ChainlinkResponse {
  jobRunID: string | number;
  statusCode: number;
  data?: {
    result: number | string;
    // Additional data fields
    [key: string]: unknown;
  };
  error?: string;
}

/**
 * Build a successful Chainlink response
 */
export function buildSuccessResponse(
  requestId: string | number,
  price: AggregatedPrice
): ChainlinkResponse {
  return {
    jobRunID: requestId,
    statusCode: 200,
    data: {
      result: price.priceInt.toString(),
      price: price.price,
      twap: price.twap,
      priceInt: price.priceInt.toString(),
      sourceCount: price.sourceCount,
      timestamp: price.timestamp,
      assetId: price.assetId,
    },
  };
}

/**
 * Build an error Chainlink response
 */
export function buildErrorResponse(
  requestId: string | number,
  statusCode: number,
  error: string
): ChainlinkResponse {
  return {
    jobRunID: requestId,
    statusCode,
    error,
  };
}

/**
 * Validate incoming Chainlink request
 */
export function validateRequest(body: unknown): ChainlinkRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const req = body as Record<string, unknown>;

  // ID is required
  if (req.id === undefined) {
    return null;
  }

  // Data must be an object
  if (!req.data || typeof req.data !== 'object') {
    return null;
  }

  return {
    id: req.id as string | number,
    data: req.data as ChainlinkRequest['data'],
  };
}
