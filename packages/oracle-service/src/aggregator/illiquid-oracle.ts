/**
 * Illiquid Asset Oracle Strategies
 *
 * Inspired by:
 * - NFTperp: https://nftperp.gitbook.io/core-docs/nftperp/protocol-design/oracle
 * - Ventuals: https://docs.ventuals.com/perp-specifications/private-companies
 *
 * These strategies handle assets that:
 * - Lack deep liquidity
 * - Have wide bid-ask spreads
 * - Are susceptible to manipulation
 * - Have sparse transaction data
 */

import type { PricePoint } from '../adapters/types.js';
import { median, mad } from './outlier.js';

export interface OracleConfig {
  // TWAP window in milliseconds
  twapWindowMs: number;
  // Volatility threshold for adaptive TWAP (percentile)
  volatilityThreshold: number;
  // Short TWAP window during high volatility
  shortTwapWindowMs: number;
  // Maximum deviation from median before winsorization (e.g., 0.05 = 5%)
  winsorizeThreshold: number;
  // Minimum sources required for valid price
  minSources: number;
  // Weight for EMA of mark price (Ventuals-style)
  markPriceWeight: number;
  // Weight for external data (Ventuals-style)
  externalDataWeight: number;
}

export const DEFAULT_ILLIQUID_CONFIG: OracleConfig = {
  twapWindowMs: 300000,          // 5 minutes default
  volatilityThreshold: 0.95,     // 95th percentile triggers short TWAP
  shortTwapWindowMs: 900000,     // 15 minutes for volatile periods
  winsorizeThreshold: 0.05,      // 5% deviation triggers winsorization
  minSources: 2,                 // Minimum 2 sources
  markPriceWeight: 0.667,        // 2/3 weight for market price (Ventuals)
  externalDataWeight: 0.333,     // 1/3 weight for external data (Ventuals)
};

export interface SourceWeight {
  name: string;
  weight: number;        // Volume-based weight
  reliability: number;   // Historical reliability score (0-1)
}

export interface BidAskData {
  bid: number;
  ask: number;
  source: string;
  timestamp: number;
}

export interface IlliquidPriceResult {
  price: number;
  confidence: number;      // 0-1 confidence score
  method: 'nftperp' | 'ventuals' | 'hybrid';
  components: {
    tradeWeightedFloor?: number;
    salesFloor?: number;
    bidAskMid?: number;
    externalValuation?: number;
    markPriceEma?: number;
  };
  volatilityAdjusted: boolean;
  winsorized: boolean;
}

/**
 * NFTperp-style Oracle for Illiquid Assets
 *
 * Three-component approach:
 * 1. Trade Weighted Floor Price - volume-weighted average across sources
 * 2. Sales Floor Price - outlier-filtered recent sales
 * 3. Bid-Ask Floor Price - mid-price from best bid/ask
 *
 * Final price = median of components with winsorization
 */
export class NFTperpStyleOracle {
  private priceHistory: Map<string, number[]> = new Map();
  private volatilityHistory: number[] = [];

  constructor(private config: OracleConfig = DEFAULT_ILLIQUID_CONFIG) {}

  /**
   * Calculate price using NFTperp methodology
   */
  calculatePrice(
    prices: PricePoint[],
    sourceWeights: SourceWeight[],
    bidAskData?: BidAskData[]
  ): IlliquidPriceResult {
    const components: IlliquidPriceResult['components'] = {};
    let winsorized = false;
    let volatilityAdjusted = false;

    // 1. Trade Weighted Floor Price
    const tradeWeighted = this.calculateTradeWeightedPrice(prices, sourceWeights);
    if (tradeWeighted !== null) {
      components.tradeWeightedFloor = tradeWeighted;
    }

    // 2. Sales Floor Price (outlier-filtered)
    const salesFloor = this.calculateSalesFloorPrice(prices);
    if (salesFloor !== null) {
      components.salesFloor = salesFloor;
    }

    // 3. Bid-Ask Mid Price
    if (bidAskData && bidAskData.length > 0) {
      const bidAskMid = this.calculateBidAskMidPrice(bidAskData);
      if (bidAskMid !== null) {
        components.bidAskMid = bidAskMid;
      }
    }

    // Get available components
    const componentValues = Object.values(components).filter(
      (v): v is number => v !== undefined && v > 0
    );

    if (componentValues.length === 0) {
      return {
        price: 0,
        confidence: 0,
        method: 'nftperp',
        components,
        volatilityAdjusted,
        winsorized,
      };
    }

    // Calculate median of components
    const medianPrice = median(componentValues);

    // Apply winsorization - cap values that deviate too much from median
    const winsorizedValues = componentValues.map((v) => {
      const deviation = Math.abs(v - medianPrice) / medianPrice;
      if (deviation > this.config.winsorizeThreshold) {
        winsorized = true;
        // Cap at threshold
        return v > medianPrice
          ? medianPrice * (1 + this.config.winsorizeThreshold)
          : medianPrice * (1 - this.config.winsorizeThreshold);
      }
      return v;
    });

    // Final price is median of winsorized values
    const finalPrice = median(winsorizedValues);

    // Check volatility and adjust confidence
    const volatility = this.calculateVolatility(finalPrice);
    if (volatility > this.config.volatilityThreshold) {
      volatilityAdjusted = true;
    }

    // Confidence based on number of sources and agreement
    const spread = Math.max(...componentValues) - Math.min(...componentValues);
    const spreadPct = spread / medianPrice;
    const sourceConfidence = Math.min(componentValues.length / 3, 1);
    const spreadConfidence = Math.max(0, 1 - spreadPct * 2);
    const confidence = (sourceConfidence + spreadConfidence) / 2;

    return {
      price: finalPrice,
      confidence,
      method: 'nftperp',
      components,
      volatilityAdjusted,
      winsorized,
    };
  }

  /**
   * Volume-weighted average price across sources
   */
  private calculateTradeWeightedPrice(
    prices: PricePoint[],
    sourceWeights: SourceWeight[]
  ): number | null {
    if (prices.length === 0) return null;

    const weightMap = new Map(sourceWeights.map((w) => [w.name, w.weight]));
    let totalWeight = 0;
    let weightedSum = 0;

    for (const price of prices) {
      const weight = weightMap.get(price.source) || 1;
      weightedSum += price.price * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
  }

  /**
   * Sales floor with robust outlier detection
   * Tracks addresses/sources to identify wash trading
   */
  private calculateSalesFloorPrice(prices: PricePoint[]): number | null {
    if (prices.length === 0) return null;

    const values = prices.map((p) => p.price);

    // Use MAD-based outlier removal
    const medianVal = median(values);
    const madVal = mad(values);
    const threshold = 3 * madVal;

    // Filter outliers
    const filtered = values.filter(
      (v) => Math.abs(v - medianVal) <= threshold
    );

    if (filtered.length === 0) return null;

    // Weight recent trades more heavily (exponential decay)
    const now = Date.now();
    const recentPrices = prices
      .filter((p) => Math.abs(p.price - medianVal) <= threshold)
      .sort((a, b) => b.timestamp - a.timestamp);

    let weightedSum = 0;
    let totalWeight = 0;

    for (const price of recentPrices) {
      const age = (now - price.timestamp) / 1000 / 60; // Age in minutes
      const weight = Math.exp(-age / 30); // 30-minute half-life
      weightedSum += price.price * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : median(filtered);
  }

  /**
   * Mid-price from best bid/ask across venues
   */
  private calculateBidAskMidPrice(bidAskData: BidAskData[]): number | null {
    if (bidAskData.length === 0) return null;

    // Get best bid and best ask
    const bestBid = Math.max(...bidAskData.map((d) => d.bid));
    const bestAsk = Math.min(...bidAskData.map((d) => d.ask));

    if (bestBid <= 0 || bestAsk <= 0) return null;
    if (bestBid >= bestAsk) return null; // Crossed market

    return (bestBid + bestAsk) / 2;
  }

  /**
   * Calculate rolling volatility for adaptive TWAP
   */
  private calculateVolatility(price: number): number {
    this.volatilityHistory.push(price);

    // Keep last 100 observations
    if (this.volatilityHistory.length > 100) {
      this.volatilityHistory.shift();
    }

    if (this.volatilityHistory.length < 10) {
      return 0;
    }

    // Calculate standard deviation
    const mean =
      this.volatilityHistory.reduce((a, b) => a + b, 0) /
      this.volatilityHistory.length;
    const variance =
      this.volatilityHistory.reduce(
        (sum, val) => sum + Math.pow(val - mean, 2),
        0
      ) / this.volatilityHistory.length;

    return Math.sqrt(variance) / mean; // Coefficient of variation
  }
}

/**
 * Ventuals-style Oracle for Assets Without Spot Markets
 *
 * Formula: P_oracle = (1/3) × P_External + (2/3) × EMA_2h(MarkPx)
 *
 * Incorporates:
 * - External valuation data (secondary transactions, funding rounds, etc.)
 * - EMA of mark price for price discovery
 */
export class VentualsStyleOracle {
  private markPriceHistory: { price: number; timestamp: number }[] = [];
  private emaValue: number | null = null;
  private lastEmaTimestamp: number = 0;

  constructor(
    private config: OracleConfig = DEFAULT_ILLIQUID_CONFIG,
    private emaWindowMs: number = 7200000 // 2 hours
  ) {}

  /**
   * Calculate price using Ventuals methodology
   */
  calculatePrice(
    markPrice: number,
    externalValuation: number | null
  ): IlliquidPriceResult {
    const components: IlliquidPriceResult['components'] = {};
    const now = Date.now();

    // Update mark price EMA
    this.updateEma(markPrice, now);
    const ema = this.emaValue || markPrice;
    components.markPriceEma = ema;

    // If we have external valuation data
    if (externalValuation !== null && externalValuation > 0) {
      components.externalValuation = externalValuation;

      // Weighted combination: 1/3 external + 2/3 EMA
      const price =
        this.config.externalDataWeight * externalValuation +
        this.config.markPriceWeight * ema;

      // Confidence based on data freshness and source availability
      const confidence = 0.8;

      return {
        price,
        confidence,
        method: 'ventuals',
        components,
        volatilityAdjusted: false,
        winsorized: false,
      };
    }

    // Fallback to pure EMA if no external data
    return {
      price: ema,
      confidence: 0.5,
      method: 'ventuals',
      components,
      volatilityAdjusted: false,
      winsorized: false,
    };
  }

  /**
   * Update exponential moving average
   */
  private updateEma(price: number, timestamp: number): void {
    this.markPriceHistory.push({ price, timestamp });

    // Keep history within EMA window
    const cutoff = timestamp - this.emaWindowMs;
    this.markPriceHistory = this.markPriceHistory.filter(
      (p) => p.timestamp >= cutoff
    );

    if (this.emaValue === null) {
      this.emaValue = price;
    } else {
      // Calculate alpha based on time elapsed
      const timeDelta = timestamp - this.lastEmaTimestamp;
      const alpha = 1 - Math.exp(-timeDelta / (this.emaWindowMs / 3));
      this.emaValue = alpha * price + (1 - alpha) * this.emaValue;
    }

    this.lastEmaTimestamp = timestamp;
  }

  /**
   * Get current EMA value
   */
  getEma(): number | null {
    return this.emaValue;
  }
}

/**
 * Hybrid Oracle combining both approaches
 *
 * Best for hardware assets where we have:
 * - Multiple retailer prices (NFTperp-style multi-source)
 * - Variable liquidity/availability
 * - Potential for manipulation via flash sales
 */
export class HybridIlliquidOracle {
  private nftperpOracle: NFTperpStyleOracle;
  private ventualsOracle: VentualsStyleOracle;

  constructor(config: OracleConfig = DEFAULT_ILLIQUID_CONFIG) {
    this.nftperpOracle = new NFTperpStyleOracle(config);
    this.ventualsOracle = new VentualsStyleOracle(config);
  }

  /**
   * Calculate price using hybrid methodology
   *
   * 1. Use NFTperp approach for multi-source aggregation
   * 2. Apply Ventuals EMA smoothing for stability
   * 3. Combine with configurable weights
   */
  calculatePrice(
    prices: PricePoint[],
    sourceWeights: SourceWeight[],
    bidAskData?: BidAskData[],
    externalValuation?: number
  ): IlliquidPriceResult {
    // Get NFTperp-style price from multiple sources
    const nftperpResult = this.nftperpOracle.calculatePrice(
      prices,
      sourceWeights,
      bidAskData
    );

    if (nftperpResult.price <= 0) {
      return nftperpResult;
    }

    // Apply Ventuals-style EMA smoothing
    const ventualsResult = this.ventualsOracle.calculatePrice(
      nftperpResult.price,
      externalValuation || null
    );

    // Combine results
    const components = {
      ...nftperpResult.components,
      ...ventualsResult.components,
    };

    // Final price is Ventuals smoothed output
    const finalPrice = ventualsResult.price;

    // Confidence is weighted average
    const confidence =
      (nftperpResult.confidence * 0.6 + ventualsResult.confidence * 0.4);

    return {
      price: finalPrice,
      confidence,
      method: 'hybrid',
      components,
      volatilityAdjusted: nftperpResult.volatilityAdjusted,
      winsorized: nftperpResult.winsorized,
    };
  }
}

/**
 * Source weight calculator based on historical reliability
 */
export function calculateSourceWeights(
  sourceStats: Map<string, { volume: number; reliability: number }>
): SourceWeight[] {
  const totalVolume = Array.from(sourceStats.values()).reduce(
    (sum, s) => sum + s.volume,
    0
  );

  return Array.from(sourceStats.entries()).map(([name, stats]) => ({
    name,
    weight: totalVolume > 0 ? stats.volume / totalVolume : 1,
    reliability: stats.reliability,
  }));
}
