export { PriceAggregator } from './aggregator.js';
export type { AggregatedPrice, PriceUpdate, SourceDetail } from './aggregator.js';
export { TWAPCalculator } from './twap.js';
export { filterOutliers, filterOutliersIQR, median, medianAbsoluteDeviation, mad } from './outlier.js';

// Illiquid asset oracle strategies (inspired by NFTperp & Ventuals)
export {
  NFTperpStyleOracle,
  VentualsStyleOracle,
  HybridIlliquidOracle,
  calculateSourceWeights,
  DEFAULT_ILLIQUID_CONFIG,
} from './illiquid-oracle.js';
export type {
  OracleConfig,
  SourceWeight,
  BidAskData,
  IlliquidPriceResult,
} from './illiquid-oracle.js';
