import { describe, it, expect } from "vitest";
import { parseConfig, deriveGrid } from "../src/config";

describe("parseConfig", () => {
  it("returns documented defaults for an empty query string", () => {
    expect(parseConfig("")).toEqual({
      groups: null,
      cols: null,
      rows: null,
      detail: "full",
      scores: true,
      upcoming: 5,
      finished: 8,
      refreshMs: 90_000,
      theme: "dark",
      highlight: [],
      fit: true,
      view: "auto",
      bracket: "full",
    });
  });

  it("parses a CSV of group letters, uppercased, A–L only, deduped", () => {
    expect(parseConfig("?groups=a,B,b,Z,C").groups).toEqual(["A", "B", "C"]);
  });

  it("treats an all-invalid groups list as null (show all)", () => {
    expect(parseConfig("?groups=Z,9,").groups).toBeNull();
  });

  it("parses cols/rows as positive integers, else null", () => {
    expect(parseConfig("?cols=3&rows=4")).toMatchObject({ cols: 3, rows: 4 });
    expect(parseConfig("?cols=0&rows=-2")).toMatchObject({
      cols: null,
      rows: null,
    });
    expect(parseConfig("?cols=abc")).toMatchObject({ cols: null });
  });

  it("parses detail (only 'compact' switches off 'full')", () => {
    expect(parseConfig("?detail=compact").detail).toBe("compact");
    expect(parseConfig("?detail=anything").detail).toBe("full");
  });

  it("disables the feed only on scores=off", () => {
    expect(parseConfig("?scores=off").scores).toBe(false);
    expect(parseConfig("?scores=on").scores).toBe(true);
  });

  it("parses upcoming/finished as non-negative ints, else default", () => {
    expect(parseConfig("?upcoming=3&finished=10")).toMatchObject({
      upcoming: 3,
      finished: 10,
    });
    expect(parseConfig("?upcoming=-1&finished=x")).toMatchObject({
      upcoming: 5,
      finished: 8,
    });
    expect(parseConfig("?upcoming=0").upcoming).toBe(0);
  });

  it("parses refresh seconds into ms and clamps to a 30s minimum", () => {
    expect(parseConfig("?refresh=120").refreshMs).toBe(120_000);
    expect(parseConfig("?refresh=10").refreshMs).toBe(30_000);
    expect(parseConfig("?refresh=0").refreshMs).toBe(30_000);
    expect(parseConfig("?refresh=junk").refreshMs).toBe(90_000);
  });

  it("parses theme (only 'light' switches off 'dark')", () => {
    expect(parseConfig("?theme=light").theme).toBe("light");
    expect(parseConfig("?theme=neon").theme).toBe("dark");
  });

  it("parses highlight as uppercased, trimmed, non-empty codes", () => {
    expect(parseConfig("?highlight=usa, mex ,,can").highlight).toEqual([
      "USA",
      "MEX",
      "CAN",
    ]);
  });

  it("disables fit only on fit=off", () => {
    expect(parseConfig("?fit=off").fit).toBe(false);
    expect(parseConfig("?fit=on").fit).toBe(true);
  });

  it("ignores unknown params", () => {
    expect(() => parseConfig("?bogus=1&groups=A")).not.toThrow();
    expect(parseConfig("?bogus=1&groups=A").groups).toEqual(["A"]);
  });
});

describe("parseConfig view/bracket", () => {
  it("defaults view to auto and bracket to full", () => {
    expect(parseConfig("")).toMatchObject({ view: "auto", bracket: "full" });
  });

  it("parses view as auto | standings | bracket, else auto", () => {
    expect(parseConfig("?view=standings").view).toBe("standings");
    expect(parseConfig("?view=bracket").view).toBe("bracket");
    expect(parseConfig("?view=nonsense").view).toBe("auto");
  });

  it("parses bracket as full | focused, else full", () => {
    expect(parseConfig("?bracket=focused").bracket).toBe("focused");
    expect(parseConfig("?bracket=full").bracket).toBe("full");
    expect(parseConfig("?bracket=weird").bracket).toBe("full");
  });
});

describe("deriveGrid", () => {
  it("defaults to 2 columns and preserves 2x6 for 12 groups", () => {
    expect(deriveGrid(12, null, null)).toEqual({ cols: 2, rows: 6 });
  });

  it("uses a single column for a single group", () => {
    expect(deriveGrid(1, null, null)).toEqual({ cols: 1, rows: 1 });
  });

  it("derives rows from an explicit column count", () => {
    expect(deriveGrid(8, 4, null)).toEqual({ cols: 4, rows: 2 });
    expect(deriveGrid(7, 3, null)).toEqual({ cols: 3, rows: 3 });
  });

  it("derives columns from an explicit row count", () => {
    expect(deriveGrid(6, null, 2)).toEqual({ cols: 3, rows: 2 });
  });

  it("honors both when given", () => {
    expect(deriveGrid(4, 4, 1)).toEqual({ cols: 4, rows: 1 });
  });

  it("expands rows when an explicit grid is too small to hold every group", () => {
    expect(deriveGrid(12, 1, 1)).toEqual({ cols: 1, rows: 12 });
    expect(deriveGrid(12, 3, 2)).toEqual({ cols: 3, rows: 4 });
  });
});
