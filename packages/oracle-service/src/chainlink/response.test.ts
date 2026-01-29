import { describe, it, expect } from 'vitest';
import {
  validateRequest,
  buildSuccessResponse,
  buildErrorResponse,
} from './response.js';
import type { AggregatedPrice } from '../aggregator/index.js';

describe('Chainlink response', () => {
  describe('validateRequest', () => {
    it('returns null for null input', () => {
      expect(validateRequest(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(validateRequest('string')).toBeNull();
      expect(validateRequest(123)).toBeNull();
    });

    it('returns null when id is missing', () => {
      expect(validateRequest({ data: {} })).toBeNull();
    });

    it('returns null when data is missing', () => {
      expect(validateRequest({ id: '1' })).toBeNull();
    });

    it('returns null when data is not an object', () => {
      expect(validateRequest({ id: '1', data: 'string' })).toBeNull();
    });

    it('validates correct request', () => {
      const request = {
        id: '1',
        data: { asset: 'GPU_RTX4090' },
      };

      const result = validateRequest(request);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('1');
      expect(result!.data.asset).toBe('GPU_RTX4090');
    });

    it('accepts numeric id', () => {
      const request = {
        id: 123,
        data: { asset: 'GPU_RTX4090' },
      };

      const result = validateRequest(request);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(123);
    });
  });

  describe('buildSuccessResponse', () => {
    it('builds correct response', () => {
      const price: AggregatedPrice = {
        assetId: 'GPU_RTX4090',
        price: 1599.99,
        twap: 1605.50,
        priceInt: BigInt('159999000000'),
        sourceCount: 3,
        timestamp: 1704067200000,
        updatedAt: 1704067200000,
      };

      const response = buildSuccessResponse('1', price);

      expect(response.jobRunID).toBe('1');
      expect(response.statusCode).toBe(200);
      expect(response.data?.result).toBe('159999000000');
      expect(response.data?.price).toBe(1599.99);
      expect(response.data?.twap).toBe(1605.50);
      expect(response.data?.sourceCount).toBe(3);
      expect(response.data?.assetId).toBe('GPU_RTX4090');
      expect(response.error).toBeUndefined();
    });
  });

  describe('buildErrorResponse', () => {
    it('builds correct error response', () => {
      const response = buildErrorResponse('1', 400, 'Invalid asset');

      expect(response.jobRunID).toBe('1');
      expect(response.statusCode).toBe(400);
      expect(response.error).toBe('Invalid asset');
      expect(response.data).toBeUndefined();
    });
  });
});
