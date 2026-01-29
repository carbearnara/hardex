import { describe, it, expect } from 'vitest';
import {
  median,
  medianAbsoluteDeviation,
  filterOutliers,
  filterOutliersIQR,
} from './outlier.js';
import type { PricePoint } from '../adapters/types.js';

describe('outlier detection', () => {
  describe('median', () => {
    it('returns 0 for empty array', () => {
      expect(median([])).toBe(0);
    });

    it('returns the value for single element', () => {
      expect(median([5])).toBe(5);
    });

    it('returns middle value for odd length array', () => {
      expect(median([1, 3, 5])).toBe(3);
      expect(median([5, 1, 3])).toBe(3); // unsorted
    });

    it('returns average of two middle values for even length array', () => {
      expect(median([1, 2, 3, 4])).toBe(2.5);
      expect(median([4, 1, 3, 2])).toBe(2.5); // unsorted
    });
  });

  describe('medianAbsoluteDeviation', () => {
    it('returns 0 for empty array', () => {
      expect(medianAbsoluteDeviation([])).toBe(0);
    });

    it('returns 0 when all values are the same', () => {
      expect(medianAbsoluteDeviation([5, 5, 5])).toBe(0);
    });

    it('calculates MAD correctly', () => {
      // Values: [1, 2, 3, 4, 5]
      // Median: 3
      // Absolute deviations: [2, 1, 0, 1, 2]
      // MAD: 1
      expect(medianAbsoluteDeviation([1, 2, 3, 4, 5])).toBe(1);
    });
  });

  describe('filterOutliers', () => {
    const createPrices = (values: number[]): PricePoint[] =>
      values.map((price) => ({
        price,
        source: 'test',
        timestamp: Date.now(),
        assetId: 'GPU_RTX4090',
      }));

    it('returns all prices when less than 3 data points', () => {
      const prices = createPrices([100, 200]);
      expect(filterOutliers(prices)).toHaveLength(2);
    });

    it('keeps prices within threshold', () => {
      const prices = createPrices([100, 102, 98, 101, 99]);
      const filtered = filterOutliers(prices);
      expect(filtered).toHaveLength(5);
    });

    it('removes outliers', () => {
      // Most prices around 100, one outlier at 500
      const prices = createPrices([100, 102, 98, 101, 99, 500]);
      const filtered = filterOutliers(prices);

      expect(filtered.length).toBeLessThan(6);
      expect(filtered.every((p) => p.price < 200)).toBe(true);
    });

    it('handles extreme outliers', () => {
      const prices = createPrices([100, 100, 100, 100, 10000]);
      const filtered = filterOutliers(prices);

      expect(filtered.every((p) => p.price === 100)).toBe(true);
    });
  });

  describe('filterOutliersIQR', () => {
    const createPrices = (values: number[]): PricePoint[] =>
      values.map((price) => ({
        price,
        source: 'test',
        timestamp: Date.now(),
        assetId: 'GPU_RTX4090',
      }));

    it('returns all prices when less than 4 data points', () => {
      const prices = createPrices([100, 200, 300]);
      expect(filterOutliersIQR(prices)).toHaveLength(3);
    });

    it('removes outliers using IQR method', () => {
      // Regular prices plus one extreme outlier
      const prices = createPrices([100, 110, 120, 130, 140, 150, 1000]);
      const filtered = filterOutliersIQR(prices);

      expect(filtered.length).toBeLessThan(7);
      expect(filtered.find((p) => p.price === 1000)).toBeUndefined();
    });
  });
});
