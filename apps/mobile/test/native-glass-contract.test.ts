import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native glass source contract", () => {
  it("uses a positive minimum when UIKit cannot derive a rounded containing shape", () => {
    const source = readFileSync(new URL("../modules/nomly-glass/ios/ConcentricGlassView.swift", import.meta.url), "utf8");
    expect(source).toContain("var minimumCornerRadius: CGFloat = 32");
    expect(source).toContain(".containerConcentric(minimum: insetAdjustedContainerRadius())");
    expect(source).toContain("container.effectiveRadius(corner: .allCorners)");
    expect(source).toContain("return minimumCornerRadius");
    expect(source).not.toContain(".containerConcentric()");
  });
  it("exposes the correction version and validates adjustable minimum radii", () => {
    const source = readFileSync(new URL("../modules/nomly-glass/ios/NomlyGlassModule.swift", import.meta.url), "utf8");
    expect(source).toContain('Constant("cornerConfigurationVersion") { 3 }');
    expect(source).toContain('Prop("minimumCornerRadius")');
    expect(source).toContain("radius.isFinite ? max(1, radius) : 32");
  });
  it("subtracts the actual card inset rather than copying or clamping the sheet radius", () => {
    const source = readFileSync(new URL("../modules/nomly-glass/ios/ConcentricGlassView.swift", import.meta.url), "utf8");
    expect(source).toContain("let cardFrame = convert(bounds, to: container)");
    expect(source).toContain("cardFrame.minX - container.bounds.minX");
    expect(source).toContain("container.bounds.maxX - cardFrame.maxX");
    expect(source).toContain("return max(1, radius - min(leadingInset, trailingInset))");
    expect(source).not.toContain("return max(minimumCornerRadius, radius)");
  });
});
