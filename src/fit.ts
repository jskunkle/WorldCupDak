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

const MIN_FONT_PX = 6;
const MAX_FONT_PX = 160;
const FIT_ITERATIONS = 14;

/**
 * Sets the root font-size to the largest value at which `#app` does not
 * overflow its viewport box in either axis. All fit-mode sizes are expressed
 * in rem/em, so this scales the whole board. Safe to call repeatedly.
 *
 * Relies on fit-mode CSS making content overflow-able (#app overflow:hidden,
 * not `clip`, so scrollHeight still reports the true content size).
 */
export function fitToViewport(app: HTMLElement): void {
  const root = document.documentElement;
  const fits = (fontPx: number): boolean => {
    root.style.fontSize = `${fontPx}px`;
    return (
      app.scrollHeight <= app.clientHeight && app.scrollWidth <= app.clientWidth
    );
  };
  const best = binarySearchLargest(
    MIN_FONT_PX,
    MAX_FONT_PX,
    FIT_ITERATIONS,
    fits,
  );
  root.style.fontSize = `${best}px`;
}
