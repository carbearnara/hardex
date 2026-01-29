import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TWAPCalculator } from './twap.js';
import type { AssetId } from '../config/index.js';

describe('TWAPCalculator', () => {
  let twap: TWAPCalculator;
  const ASSET_ID: AssetId = 'GPU_RTX4090';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    twap = new TWAPCalculator(300000); // 5 minute window
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('addObservation', () => {
    it('adds observations', () => {
      twap.addObservation(ASSET_ID, 1000);
      expect(twap.getObservationCount(ASSET_ID)).toBe(1);

      twap.addObservation(ASSET_ID, 1100);
      expect(twap.getObservationCount(ASSET_ID)).toBe(2);
    });
  });

  describe('getTWAP', () => {
    it('returns null when no observations', () => {
      expect(twap.getTWAP(ASSET_ID)).toBeNull();
    });

    it('returns the price for single observation', () => {
      twap.addObservation(ASSET_ID, 1000);
      expect(twap.getTWAP(ASSET_ID)).toBe(1000);
    });

    it('calculates time-weighted average', () => {
      const now = Date.now();

      // Price at 1000 for first 2 minutes
      twap.addObservation(ASSET_ID, 1000, now);

      // Price changes to 1100 at minute 2
      vi.setSystemTime(now + 120000);
      twap.addObservation(ASSET_ID, 1100, now + 120000);

      // Calculate TWAP at minute 3 (1 minute after change)
      vi.setSystemTime(now + 180000);

      // Time breakdown:
      // - 1000 for 120s (0 to 120s)
      // - 1100 for 60s (120s to 180s)
      // TWAP = (1000 * 120000 + 1100 * 60000) / 180000
      const expectedTWAP = (1000 * 120000 + 1100 * 60000) / 180000;

      const actualTWAP = twap.getTWAP(ASSET_ID);
      expect(actualTWAP).toBeCloseTo(expectedTWAP, 2);
    });

    it('prunes old observations outside window', () => {
      const now = Date.now();

      twap.addObservation(ASSET_ID, 1000, now);

      // Move 6 minutes forward (past 5 minute window)
      vi.setSystemTime(now + 360000);
      twap.addObservation(ASSET_ID, 1100, now + 360000);

      // Old observation should be pruned
      expect(twap.getObservationCount(ASSET_ID)).toBe(1);
      expect(twap.getTWAP(ASSET_ID)).toBe(1100);
    });
  });

  describe('getSpotPrice', () => {
    it('returns null when no observations', () => {
      expect(twap.getSpotPrice(ASSET_ID)).toBeNull();
    });

    it('returns most recent price', () => {
      const now = Date.now();

      twap.addObservation(ASSET_ID, 1000, now);
      twap.addObservation(ASSET_ID, 1100, now + 60000);
      twap.addObservation(ASSET_ID, 1200, now + 120000);

      expect(twap.getSpotPrice(ASSET_ID)).toBe(1200);
    });
  });

  describe('clear', () => {
    it('clears observations for specific asset', () => {
      twap.addObservation(ASSET_ID, 1000);
      twap.addObservation('GPU_RTX4080', 800);

      twap.clear(ASSET_ID);

      expect(twap.getObservationCount(ASSET_ID)).toBe(0);
      expect(twap.getObservationCount('GPU_RTX4080')).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('clears all observations', () => {
      twap.addObservation(ASSET_ID, 1000);
      twap.addObservation('GPU_RTX4080', 800);

      twap.clearAll();

      expect(twap.getObservationCount(ASSET_ID)).toBe(0);
      expect(twap.getObservationCount('GPU_RTX4080')).toBe(0);
    });
  });
});
