import type { OperatorMenuCategory, OperatorMenuItem, OperatorModifierGroup } from "../../model";
import { formatMoney } from "../../ui/format";
import { getItemCategories } from "./menu-domain";

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[$€,£_]/g, " ").trim();
}

function matches(query: string, fields: Array<string | undefined>) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(fields.filter((field) => field !== undefined).join(" "));
  return terms.every((term) => text.includes(term));
}

function amountText(cents: number) {
  return `${formatMoney(cents)} ${(cents / 100).toFixed(2)}`;
}

function modifierFields(group: OperatorModifierGroup): Array<string | undefined> {
  return [
    group.id, group.label, group.description, group.selectionType,
    group.selectionType === "single" ? "Single selection" : "Multiple selection",
    group.required ? "Required" : "Optional",
    `minimum ${group.minSelections ?? 0}`, `maximum ${group.maxSelections ?? "unlimited"}`,
    ...group.options.flatMap((option) => [
      option.label, option.description, amountText(option.priceDeltaCents),
      option.default ? "Default" : "", option.available ? "Available" : "Sold out"
    ])
  ];
}

export function searchMenuItems(items: readonly OperatorMenuItem[], categories: readonly OperatorMenuCategory[], groups: readonly OperatorModifierGroup[], query: string) {
  if (!query.trim()) return items;
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  return items.filter((item) => matches(query, [
    item.itemId, item.name, item.description, amountText(item.priceCents), ...item.badgeCodes,
    item.available ? "Available" : "Sold out", item.visible ? "Visible" : "Hidden", item.featured ? "Featured" : "",
    ...getItemCategories(item, categories).map((category) => category.title),
    ...item.modifierGroupAssignments.flatMap((assignment) => {
      const group = groupsById.get(assignment.modifierGroupId);
      return group ? modifierFields(group) : [];
    })
  ]));
}

export function searchMenuCategories(categories: readonly OperatorMenuCategory[], query: string) {
  if (!query.trim()) return categories;
  return categories.filter((category) => matches(query, [
    category.categoryId, category.title, category.description,
    category.visible ? "Visible" : "Hidden", `${category.items.length} items`,
    ...category.items.map((item) => item.name)
  ]));
}

export function searchModifierGroups(groups: readonly OperatorModifierGroup[], query: string) {
  if (!query.trim()) return groups;
  return groups.filter((group) => matches(query, modifierFields(group)));
}
