import { describe, expect, it } from "vitest";
import { sanitizeCustomizationGroupsForSubmit } from "../src/customizations";

describe("dashboard customization compatibility", () => {
  it("preserves explicit selection constraints when submitting legacy groups", () => {
    const [group] = sanitizeCustomizationGroupsForSubmit([
      {
        id: "milk",
        sourceGroupId: undefined,
        label: "Milk",
        description: undefined,
        selectionType: "multiple",
        required: true,
        minSelections: 1,
        maxSelections: 2,
        sortOrder: 0,
        displayStyle: undefined,
        options: [
          {
            id: "oat",
            label: "Oat",
            description: undefined,
            priceDeltaCents: 75,
            default: false,
            available: true,
            sortOrder: 0,
            displayStyle: undefined
          }
        ]
      }
    ]);

    expect(group).toMatchObject({ minSelections: 1, maxSelections: 2 });
  });
});
