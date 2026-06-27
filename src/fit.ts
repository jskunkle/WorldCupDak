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

// Leave a little vertical breathing room between stacked match boxes rather than
// growing them until they touch.
const BRACKET_VFILL = 0.92;

/**
 * Grows the root font-size so the knockout bracket fills `#app`: as large as
 * possible while (a) `#app` doesn't overflow either axis (covers the center
 * final column and total width), (b) the stacked match boxes in each column
 * don't overlap, and (c) no team label is truncated. Bracket sizes are rem/em
 * in fit mode, so this scales the whole board. Safe to call repeatedly.
 */
export function fitBracket(app: HTMLElement): void {
  const root = document.documentElement;
  // With no match boxes there is nothing to bound the size against, so growing
  // the font would blow up the lone trophy. Reset and bail (main.ts also avoids
  // painting an empty bracket, so this is a belt-and-suspenders guard).
  if (app.querySelectorAll(".bside .bm").length === 0) {
    root.style.fontSize = "";
    return;
  }
  const columns = Array.from(app.querySelectorAll<HTMLElement>(".bcol-cells"));
  const names = Array.from(app.querySelectorAll<HTMLElement>(".bm-name"));
  const board = app.querySelector<HTMLElement>(".bboard");

  const fits = (fontPx: number): boolean => {
    root.style.fontSize = `${fontPx}px`;
    // Board must not overflow its viewport box in either axis.
    if (
      app.scrollHeight > app.clientHeight ||
      app.scrollWidth > app.clientWidth
    )
      return false;
    // Columns must fit side by side without one collapsing under width pressure
    // (the thin center column has min-width:0 and would vanish otherwise).
    if (board && board.scrollWidth > board.clientWidth) return false;
    // Stacked match boxes must fit their column without overlapping. (Boxes can
    // overlap inside fixed-height flex bands without growing scrollHeight, so
    // this is checked explicitly rather than via overflow.)
    for (const cells of columns) {
      let stacked = 0;
      for (const cell of Array.from(cells.children)) {
        const box = cell.firstElementChild as HTMLElement | null;
        if (box) stacked += box.offsetHeight;
      }
      if (stacked > cells.clientHeight * BRACKET_VFILL) return false;
    }
    // No team label clipped.
    for (const name of names) {
      if (name.scrollWidth > name.clientWidth + 1) return false;
    }
    return true;
  };

  const best = binarySearchLargest(
    MIN_FONT_PX,
    MAX_FONT_PX,
    FIT_ITERATIONS,
    fits,
  );
  root.style.fontSize = `${best}px`;
}
