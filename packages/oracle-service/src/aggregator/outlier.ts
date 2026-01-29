import type { PricePoint } from '../adapters/types.js';

/**
 * Calculate the median of an array of numbers
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate Median Absolute Deviation (MAD)
 * More robust than standard deviation for detecting outliers
 */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;

  const med = median(values);
  const deviations = values.map(v => Math.abs(v - med));
  return median(deviations);
}

// Alias for convenience
export const mad = medianAbsoluteDeviation;

/**
 * Filter outliers using MAD method
 * Prices more than `threshold` MADs from median are removed
 *
 * @param prices - Array of price points
 * @param threshold - Number of MADs to use as cutoff (default: 3)
 * @returns Filtered array without outliers
 */
export function filterOutliers(
  prices: PricePoint[],
  threshold: number = 3
): PricePoint[] {
  if (prices.length < 3) {
    // Not enough data to detect outliers
    return prices;
  }

  const values = prices.map(p => p.price);
  const med = median(values);
  const mad = medianAbsoluteDeviation(values);

  // If MAD is 0 (all values same), use a small percentage of median
  const effectiveMad = mad === 0 ? med * 0.01 : mad;

  // Constant factor to approximate standard deviation from MAD
  // For normal distribution, σ ≈ 1.4826 * MAD
  const k = 1.4826;

  return prices.filter(p => {
    const zScore = Math.abs(p.price - med) / (k * effectiveMad);
    return zScore <= threshold;
  });
}

/**
 * Alternative outlier detection using IQR (Interquartile Range)
 * Useful when distribution is heavily skewed
 */
export function filterOutliersIQR(
  prices: PricePoint[],
  multiplier: number = 1.5
): PricePoint[] {
  if (prices.length < 4) {
    return prices;
  }

  const values = [...prices.map(p => p.price)].sort((a, b) => a - b);

  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);

  const q1 = values[q1Index];
  const q3 = values[q3Index];
  const iqr = q3 - q1;

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  return prices.filter(p => p.price >= lowerBound && p.price <= upperBound);
}
