import { type CustomizationValidationIssue } from "@lattelink/contracts-catalog";
import { isCustomizationOptionSelected, normalizeCustomization, type CartCustomization } from "../cart/model";
import { type MenuItemCustomizationGroup, type MenuItemCustomizationOption } from "./catalog";

export function updateCustomizationOption(
  customization: CartCustomization,
  group: MenuItemCustomizationGroup,
  option: MenuItemCustomizationOption
): CartCustomization {
  const active = isCustomizationOptionSelected(customization, group.id, option.id);
  const otherSelections = customization.selectedOptions.filter((selection) => selection.groupId !== group.id);
  const groupSelections = customization.selectedOptions.filter((selection) => selection.groupId === group.id);

  if (group.selectionType === "single") {
    return normalizeCustomization({
      ...customization,
      selectedOptions: [...otherSelections, { groupId: group.id, optionId: option.id }]
    });
  }

  if (active) {
    return normalizeCustomization({
      ...customization,
      selectedOptions: customization.selectedOptions.filter(
        (selection) => !(selection.groupId === group.id && selection.optionId === option.id)
      )
    });
  }

  if (groupSelections.length >= group.maxSelections) {
    if (group.maxSelections === 1) {
      return normalizeCustomization({
        ...customization,
        selectedOptions: [...otherSelections, { groupId: group.id, optionId: option.id }]
      });
    }

    return customization;
  }

  return normalizeCustomization({
    ...customization,
    selectedOptions: [...customization.selectedOptions, { groupId: group.id, optionId: option.id }]
  });
}

export function findGroupIssue(issues: CustomizationValidationIssue[], groupId: string) {
  return issues.find((issue) => issue.groupId === groupId);
}
