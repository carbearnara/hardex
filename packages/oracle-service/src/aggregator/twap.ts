import type { AssetId } from '../config/index.js';

interface PriceObservation {
  price: number;
  timestamp: number;
}

/**
 * Time-Weighted Average Price (TWAP) calculator
 * Maintains a rolling window of price observations and calculates
 * the time-weighted average.
 */
export class TWAPCalculator {
  private observations: Map<AssetId, PriceObservation[]> = new Map();
  private windowMs: number;

  constructor(windowMs: number = 300000) { // Default 5 minutes
    this.windowMs = windowMs;
  }

  /**
   * Add a new price observation
   */
  addObservation(assetId: AssetId, price: number, timestamp: number = Date.now()): void {
    const obs = this.observations.get(assetId) || [];
    obs.push({ price, timestamp });
    this.observations.set(assetId, obs);

    // Prune old observations
    this.prune(assetId);
  }

  /**
   * Remove observations outside the window
   */
  private prune(assetId: AssetId): void {
    const obs = this.observations.get(assetId);
    if (!obs) return;

    const cutoff = Date.now() - this.windowMs;
    const filtered = obs.filter(o => o.timestamp >= cutoff);
    this.observations.set(assetId, filtered);
  }

  /**
   * Calculate TWAP for an asset
   * Returns null if no observations available
   */
  getTWAP(assetId: AssetId): number | null {
    this.prune(assetId);

    const obs = this.observations.get(assetId);
    if (!obs || obs.length === 0) {
      return null;
    }

    if (obs.length === 1) {
      return obs[0].price;
    }

    // Sort by timestamp
    const sorted = [...obs].sort((a, b) => a.timestamp - b.timestamp);

    // Calculate time-weighted sum
    let weightedSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < sorted.length - 1; i++) {
      const duration = sorted[i + 1].timestamp - sorted[i].timestamp;
      weightedSum += sorted[i].price * duration;
      totalWeight += duration;
    }

    // Include the last observation weighted to current time
    const now = Date.now();
    const lastObs = sorted[sorted.length - 1];
    const lastDuration = now - lastObs.timestamp;

    if (lastDuration > 0) {
      weightedSum += lastObs.price * lastDuration;
      totalWeight += lastDuration;
    }

    if (totalWeight === 0) {
      return sorted[sorted.length - 1].price;
    }

    return weightedSum / totalWeight;
  }

  /**
   * Get the latest spot price (most recent observation)
   */
  getSpotPrice(assetId: AssetId): number | null {
    this.prune(assetId);

    const obs = this.observations.get(assetId);
    if (!obs || obs.length === 0) {
      return null;
    }

    // Return most recent observation
    return obs.reduce((latest, o) =>
      o.timestamp > latest.timestamp ? o : latest
    ).price;
  }

  /**
   * Get observation count for an asset
   */
  getObservationCount(assetId: AssetId): number {
    const obs = this.observations.get(assetId);
    return obs?.length || 0;
  }

  /**
   * Clear all observations for an asset
   */
  clear(assetId: AssetId): void {
    this.observations.delete(assetId);
  }

  /**
   * Clear all observations
   */
  clearAll(): void {
    this.observations.clear();
  }
}
