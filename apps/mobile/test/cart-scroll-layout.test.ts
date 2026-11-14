import { describe, expect, it } from "vitest";
import { cartContentMinimumHeight } from "../src/cart/scrollLayout";

describe("Cart scroll viewport sizing", () => {
  it("leaves room for the native header and toolbar rather than adding empty scroll height", () => {
    const height = cartContentMinimumHeight(800, 56, { top: 0, bottom: 83 });
    expect(height).toBe(661);
    expect(height + 56 + 83).toBe(800);
  });
  it("does not count overlapping header and safe-area top insets twice", () => {
    expect(cartContentMinimumHeight(800, 100, { top: 59, bottom: 83 })).toBe(617);
    expect(cartContentMinimumHeight(800, 44, { top: 59, bottom: 83 })).toBe(658);
  });
  it("adapts to sheet resizing and native toolbar height changes", () => {
    expect(cartContentMinimumHeight(600, 56, { top: 0, bottom: 83 })).toBe(461);
    expect(cartContentMinimumHeight(800, 56, { top: 0, bottom: 34 })).toBe(710);
  });
  it("does not produce a negative size before the native viewport is measured", () => {
    expect(cartContentMinimumHeight(0, 56, { top: 0, bottom: 83 })).toBe(0);
  });
});
