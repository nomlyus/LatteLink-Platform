import { describe, expect, it } from "vitest";
import { lockComponentFontScaling } from "../src/ui/fontScaling";

describe("font scaling defaults", () => {
  it("locks scaling without removing existing component defaults", () => {
    const component = {
      defaultProps: {
        existingDefault: true
      }
    };

    lockComponentFontScaling(component);

    expect(component.defaultProps).toEqual({
      existingDefault: true,
      allowFontScaling: false,
      maxFontSizeMultiplier: 1
    });
  });
});
