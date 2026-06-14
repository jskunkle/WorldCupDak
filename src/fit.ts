/**
 * Largest `value` in [lo, hi] for which `fits(value)` is true, assuming `fits`
 * is monotone (true below a threshold, false above it). Runs a fixed number of
 * binary-search iterations. Returns `lo` if nothing fits.
 */
export function binarySearchLargest(
  lo: number,
  hi: number,
  iterations: number,
  fits: (value: number) => boolean,
): number {
  let best = lo;
  let low = lo;
  let high = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
}
