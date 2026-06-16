import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout } from "./timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with the original error when the promise rejects", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });

  it("rejects with a timeout error when the promise is too slow", async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => {});
    const p = withTimeout(never, 25_000);
    vi.advanceTimersByTime(25_000);
    await expect(p).rejects.toThrow(/timeout/i);
  });
});
