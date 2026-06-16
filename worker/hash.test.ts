import { describe, it, expect } from "vitest";
import { hashString } from "./hash";

describe("hashString", () => {
  it("is deterministic for the same input", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("differs for different input", () => {
    expect(hashString("hello")).not.toBe(hashString("hellp"));
  });

  it("returns a non-empty hex string", () => {
    expect(hashString("")).toMatch(/^[0-9a-f]+$/);
  });
});
