import { describe, it, expect } from "vitest";
import { binarySearchLargest } from "../src/fit";

describe("binarySearchLargest", () => {
  it("finds the largest value satisfying a monotone predicate", () => {
    const best = binarySearchLargest(1, 100, 30, (v) => v <= 10);
    expect(best).toBeLessThanOrEqual(10);
    expect(best).toBeGreaterThan(9.99);
  });

  it("returns the low bound when nothing fits", () => {
    expect(binarySearchLargest(5, 100, 20, () => false)).toBe(5);
  });

  it("returns near the high bound when everything fits", () => {
    const best = binarySearchLargest(1, 50, 30, () => true);
    expect(best).toBeGreaterThan(49.99);
  });
});
