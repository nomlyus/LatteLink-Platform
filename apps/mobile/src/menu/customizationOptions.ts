import type { MenuItemCustomizationGroup } from "@lattelink/contracts-catalog";

export function availableCustomizationOptions(group: MenuItemCustomizationGroup) {
  return group.options.filter((option) => option.available).sort((a, b) =>
    Number(b.default) - Number(a.default) || a.sortOrder - b.sortOrder || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
