import { describe, expect, it } from "vitest";
import { midpoint, nextPosition } from "../../worker/lib/position";

describe("nextPosition", () => {
  it("adds a 1000 gap on top of the current max", () => {
    expect(nextPosition(3000)).toBe(4000);
  });

  it("starts at 1000 for an empty column", () => {
    expect(nextPosition(null)).toBe(1000);
  });
});

describe("midpoint", () => {
  it("splits the gap between two neighbours", () => {
    expect(midpoint(1000, 2000)).toBe(1500);
  });

  it("inserts at the head when there is no previous neighbour", () => {
    expect(midpoint(null, 1000)).toBe(500);
  });

  it("inserts at the tail when there is no next neighbour", () => {
    expect(midpoint(1000, null)).toBe(2000);
  });

  it("inserts into an empty column", () => {
    expect(midpoint(null, null)).toBe(1000);
  });

  it("holds precision over repeated bisection", () => {
    let prev = 0;
    let next = 1000;
    for (let i = 0; i < 40; i++) {
      const mid = midpoint(prev, next);
      expect(mid).toBeGreaterThan(prev);
      expect(mid).toBeLessThan(next);
      next = mid;
    }
  });
});
