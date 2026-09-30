import { createHash, randomUUID } from "node:crypto";
import {
  adminMenuCategoryCreateSchema,
  adminMenuCategoryUpdateSchema,
  adminMenuItemSchema,
  adminMenuResponseSchema,
  adminModifierGroupCreateSchema,
  adminModifierGroupUpdateSchema,
  menuItemCustomizationGroupSchema,
  menuItemSchema,
  menuResponseSchema,
  modifierGroupSchema,
  type AdminMenuCategoryCreate,
  type AdminMenuCategoryUpdate,
  type AdminMenuItem,
  type AdminMenuResponse,
  type AdminModifierGroupCreate,
  type AdminModifierGroupUpdate,
  type ItemModifierGroupAssignment,
  type MenuResponse,
  type ModifierGroup
} from "@lattelink/contracts-catalog";
import type {
  CatalogItemModifierGroupTable,
  CatalogMenuCategoryItemTable,
  CatalogMenuCategoryTable,
  CatalogMenuItemTable,
  CatalogModifierGroupTable,
  CatalogModifierOptionTable,
  PersistenceDb
} from "@lattelink/persistence";

type LegacyCustomizationGroup = ReturnType<typeof menuItemCustomizationGroupSchema.parse>;

export class CatalogMutationError extends Error {
  constructor(
    readonly code: "CATALOG_EXTERNAL_SYNC_READ_ONLY" | "CATALOG_LOCATION_BRAND_NOT_FOUND" | "CATEGORY_HAS_ORPHANED_ITEMS" | "MODIFIER_GROUP_IN_USE" | "MODIFIER_GROUP_CONFLICT",
    message: string,
    readonly statusCode = 409,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogMutationError";
  }
}

export function validateModifierGroupAssignmentOverrides(
  group: Pick<ModifierGroup, "id" | "selectionType" | "minSelections" | "maxSelections">,
  assignments: readonly ItemModifierGroupAssignment[]
) {
  for (const assignment of assignments) {
    const minSelections = assignment.minSelectionsOverride ?? group.minSelections;
    const maxSelections = assignment.maxSelectionsOverride ?? group.maxSelections;
    if (group.selectionType === "single" && maxSelections !== 1) {
      throw new CatalogMutationError(
        "MODIFIER_GROUP_CONFLICT",
        `Modifier group ${group.id} is single-selection and cannot have a maximum above one.`,
        422,
        { modifierGroupId: group.id }
      );
    }
    if (minSelections > maxSelections) {
      throw new CatalogMutationError(
        "MODIFIER_GROUP_CONFLICT",
        `Modifier group ${group.id} has an invalid item-specific selection range.`,
        422,
        { modifierGroupId: group.id }
      );
    }
  }
}

type ModifierGroupRow = Omit<CatalogModifierGroupTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };
type ModifierOptionRow = Omit<CatalogModifierOptionTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };
type AssignmentRow = Omit<CatalogItemModifierGroupTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };
type CategoryItemRow = Omit<CatalogMenuCategoryItemTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };
type MenuItemRow = Omit<CatalogMenuItemTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };
type CategoryRow = Omit<CatalogMenuCategoryTable, "created_at" | "updated_at"> & { created_at: string; updated_at: string };

function stableSyncId(scope: string) {
  return `sync_${createHash("sha256").update(scope).digest("hex").slice(0, 24)}`;
}

function scopedLegacyGroupId(locationId: string, itemId: string, groupId: string) {
  return `legacy_${createHash("sha256").update(`${locationId}:${itemId}:${groupId}`).digest("hex").slice(0, 24)}`;
}

function sourceScopedGroupId(
  locationId: string,
  itemId: string,
  group: LegacyCustomizationGroup,
  sourceGroupIds: ReadonlyMap<string, ReadonlySet<string>>
) {
  if (!group.sourceGroupId) {
    return scopedLegacyGroupId(locationId, itemId, group.id);
  }

  // Preserve the source item/group id when it is unambiguous. If one source
  // group id arrives with multiple item-local ids, use a deterministic source
  // identity instead so the importer still reuses one group safely.
  const itemLocalIds = sourceGroupIds.get(group.sourceGroupId);
  return itemLocalIds?.size === 1 ? group.id : stableSyncId(`group:${group.sourceGroupId}`);
}

function sourceScopedOptionId(_groupId: string, optionId: string) {
  return optionId;
}

function toLegacyGroup(group: ModifierGroupRow, options: ModifierOptionRow[], assignment?: AssignmentRow): LegacyCustomizationGroup {
  const required = assignment?.required_override ?? group.required;
  const minSelections = assignment?.min_selections_override ?? group.min_selections;
  const maxSelections = assignment?.max_selections_override ?? group.max_selections;
  return menuItemCustomizationGroupSchema.parse({
    id: group.modifier_group_id,
    label: group.label,
    description: group.description,
    sourceGroupId: group.source_group_id ?? undefined,
    displayStyle: group.display_style ?? undefined,
    selectionType: group.selection_type,
    required,
    minSelections,
    maxSelections,
    sortOrder: assignment?.sort_order ?? group.sort_order,
    options: options
      .sort((left, right) => left.sort_order - right.sort_order || left.option_id.localeCompare(right.option_id))
      .map((option) => ({
        id: option.option_id,
        label: option.label,
        description: option.description,
        priceDeltaCents: option.price_delta_cents,
        default: option.is_default,
        available: option.available,
        displayStyle: option.display_style ?? undefined,
        sortOrder: option.sort_order
      }))
  });
}

function canonicalGroupFromRows(
  group: ModifierGroupRow,
  options: ModifierOptionRow[],
  assignment?: AssignmentRow
): ModifierGroup {
  const required = assignment?.required_override ?? group.required;
  const minSelections = assignment?.min_selections_override ?? group.min_selections;
  const maxSelections = assignment?.max_selections_override ?? group.max_selections;
  return modifierGroupSchema.parse({
    id: group.modifier_group_id,
    label: group.label,
    description: group.description,
    sourceGroupId: group.source_group_id ?? undefined,
    displayStyle: group.display_style ?? undefined,
    selectionType: group.selection_type,
    required,
    minSelections,
    maxSelections,
    sortOrder: assignment?.sort_order ?? group.sort_order,
    options: options
      .sort((left, right) => left.sort_order - right.sort_order || left.option_id.localeCompare(right.option_id))
      .map((option) => ({
        id: option.option_id,
        label: option.label,
        description: option.description,
        priceDeltaCents: option.price_delta_cents,
        default: option.is_default,
        available: option.available,
        displayStyle: option.display_style ?? undefined,
        sortOrder: option.sort_order
      }))
  });
}

async function readRows(db: PersistenceDb, locationId: string) {
  const [categories, items, memberships, groups, options, assignments] = await Promise.all([
    db.selectFrom("catalog_menu_categories").selectAll().where("location_id", "=", locationId).orderBy("sort_order").orderBy("category_id").execute(),
    db.selectFrom("catalog_menu_items").selectAll().where("location_id", "=", locationId).execute(),
    db.selectFrom("catalog_menu_category_items").selectAll().where("location_id", "=", locationId).orderBy("sort_order").orderBy("item_id").execute(),
    db.selectFrom("catalog_modifier_groups").selectAll().where("location_id", "=", locationId).orderBy("sort_order").orderBy("modifier_group_id").execute(),
    db.selectFrom("catalog_modifier_options").selectAll().where("location_id", "=", locationId).orderBy("sort_order").orderBy("option_id").execute(),
    db.selectFrom("catalog_item_modifier_groups").selectAll().where("location_id", "=", locationId).orderBy("sort_order").orderBy("modifier_group_id").execute()
  ]);

  return { categories, items, memberships, groups, options, assignments };
}

function buildLegacyGroupsForItem(
  itemId: string,
  groups: ModifierGroupRow[],
  options: ModifierOptionRow[],
  assignments: AssignmentRow[]
) {
  return assignments
    .filter((assignment) => assignment.item_id === itemId)
    .map((assignment) => {
      const group = groups.find((candidate) => candidate.modifier_group_id === assignment.modifier_group_id);
      if (!group) return undefined;
      return {
        group,
        assignment,
        projected: toLegacyGroup(group, options.filter((option) => option.modifier_group_id === group.modifier_group_id), assignment)
      };
    })
    .filter((entry): entry is { group: ModifierGroupRow; assignment: AssignmentRow; projected: LegacyCustomizationGroup } => Boolean(entry))
    .sort(
      (left, right) =>
        left.assignment.sort_order - right.assignment.sort_order ||
        left.group.label.localeCompare(right.group.label) ||
        left.group.modifier_group_id.localeCompare(right.group.modifier_group_id)
    )
    .map((entry) => entry.projected);
}

function itemMemberships(memberships: CategoryItemRow[], itemId: string) {
  return memberships
    .filter((membership) => membership.item_id === itemId)
    .sort((left, right) => left.sort_order - right.sort_order || left.category_id.localeCompare(right.category_id));
}

function buildAdminItem(
  row: MenuItemRow,
  categories: CategoryRow[],
  memberships: CategoryItemRow[],
  groups: ModifierGroupRow[],
  options: ModifierOptionRow[],
  assignments: AssignmentRow[]
): AdminMenuItem {
  const itemMembership = itemMemberships(memberships, row.item_id);
  const primaryMembership = itemMembership[0];
  const primaryCategory = categories.find((category) => category.category_id === (primaryMembership?.category_id ?? row.category_id));
  const itemAssignments = assignments.filter((assignment) => assignment.item_id === row.item_id);
  const categoryIds = itemMembership.map((membership) => membership.category_id);
  return adminMenuItemSchema.parse({
    itemId: row.item_id,
    categoryId: primaryCategory?.category_id ?? row.category_id,
    categoryTitle: primaryCategory?.title ?? "Uncategorized",
    categoryIds,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url ?? undefined,
    priceCents: row.price_cents,
    badgeCodes: Array.isArray(row.badge_codes_json) ? row.badge_codes_json : row.badge_codes_json,
    visible: row.visible,
    available: row.available,
    featured: row.featured,
    modifierGroupAssignments: itemAssignments.map((assignment) => ({
      modifierGroupId: assignment.modifier_group_id,
      sortOrder: assignment.sort_order,
      requiredOverride: assignment.required_override,
      minSelectionsOverride: assignment.min_selections_override,
      maxSelectionsOverride: assignment.max_selections_override
    })),
    customizationGroups: buildLegacyGroupsForItem(row.item_id, groups, options, itemAssignments),
    sortOrder: primaryMembership?.sort_order ?? row.sort_order
  });
}

export async function getRelationalAdminMenu(db: PersistenceDb, locationId: string): Promise<AdminMenuResponse> {
  const { categories, items, memberships, groups, options, assignments } = await readRows(db, locationId);
  return adminMenuResponseSchema.parse({
    locationId,
  categories: categories.map((category: CategoryRow) => ({
      categoryId: category.category_id,
      title: category.title,
      description: category.description,
      visible: category.visible,
      sortOrder: category.sort_order,
      items: items
        .filter((item: MenuItemRow) => itemMemberships(memberships, item.item_id).some((membership) => membership.category_id === category.category_id))
        .sort((left: MenuItemRow, right: MenuItemRow) => {
          const leftMembership = memberships.find((membership) => membership.item_id === left.item_id && membership.category_id === category.category_id);
          const rightMembership = memberships.find((membership) => membership.item_id === right.item_id && membership.category_id === category.category_id);
          return (leftMembership?.sort_order ?? left.sort_order) - (rightMembership?.sort_order ?? right.sort_order) || left.item_id.localeCompare(right.item_id);
        })
        .map((item: MenuItemRow) => buildAdminItem(item, categories, memberships, groups, options, assignments))
    })),
    modifierGroups: groups.map((group: ModifierGroupRow) => canonicalGroupFromRows(group, options.filter((option: ModifierOptionRow) => option.modifier_group_id === group.modifier_group_id)))
  });
}

export async function getRelationalPublicMenu(db: PersistenceDb, locationId: string): Promise<MenuResponse> {
  const { categories, items, memberships, groups, options, assignments } = await readRows(db, locationId);
  const visibleCategories = categories.filter((category: CategoryRow) => category.visible);
  return menuResponseSchema.parse({
    locationId,
    currency: "USD",
    categories: visibleCategories.map((category: CategoryRow) => ({
      id: category.category_id,
      title: category.title,
      description: category.description,
      visible: category.visible,
      sortOrder: category.sort_order,
      items: items
        .filter((item: MenuItemRow) => item.visible && memberships.some((membership) => membership.category_id === category.category_id && membership.item_id === item.item_id))
        .sort((left: MenuItemRow, right: MenuItemRow) => {
          const leftMembership = memberships.find((membership) => membership.item_id === left.item_id && membership.category_id === category.category_id);
          const rightMembership = memberships.find((membership) => membership.item_id === right.item_id && membership.category_id === category.category_id);
          return (leftMembership?.sort_order ?? left.sort_order) - (rightMembership?.sort_order ?? right.sort_order) || left.item_id.localeCompare(right.item_id);
        })
        .map((item: MenuItemRow) => menuItemSchema.parse({
          id: item.item_id,
          name: item.name,
          description: item.description,
          imageUrl: item.image_url ?? undefined,
          priceCents: item.price_cents,
          badgeCodes: Array.isArray(item.badge_codes_json) ? item.badge_codes_json : item.badge_codes_json,
          visible: item.visible,
          available: item.available,
          featured: item.featured,
          customizationGroups: buildLegacyGroupsForItem(item.item_id, groups, options, assignments.filter((assignment) => assignment.item_id === item.item_id))
        }))
    }))
  });
}

async function assertPlatformManaged(db: PersistenceDb, locationId: string) {
  const row = await db.selectFrom("catalog_app_configs").select("app_config_json").where("location_id", "=", locationId).executeTakeFirst();
  const source = row && typeof row.app_config_json === "object" && row.app_config_json !== null
    ? ((row.app_config_json as { storeCapabilities?: { menu?: { source?: string } } }).storeCapabilities?.menu?.source ?? "platform_managed")
    : "platform_managed";
  if (source !== "platform_managed") {
    throw new CatalogMutationError(
      "CATALOG_EXTERNAL_SYNC_READ_ONLY",
      "This catalog is managed by an external synchronization source and cannot be edited by operators."
    );
  }
}

export async function assertRelationalPlatformManaged(db: PersistenceDb, locationId: string) {
  await assertPlatformManaged(db, locationId);
}

async function getBrandId(db: PersistenceDb, locationId: string) {
  const row = await db
    .selectFrom("catalog_client_locations as memberships")
    .innerJoin("catalog_clients as clients", "clients.tenant_id", "memberships.tenant_id")
    .select("clients.brand_id")
    .where("memberships.location_id", "=", locationId)
    .whereRef("memberships.brand_id", "=", "clients.brand_id")
    .executeTakeFirst();
  if (!row?.brand_id) {
    throw new CatalogMutationError(
      "CATALOG_LOCATION_BRAND_NOT_FOUND",
      "Location configuration is unavailable.",
      404
    );
  }
  return row.brand_id;
}

export async function createRelationalCategory(db: PersistenceDb, locationId: string, rawInput: AdminMenuCategoryCreate) {
  await assertPlatformManaged(db, locationId);
  const input = adminMenuCategoryCreateSchema.parse(rawInput);
  const brandId = await getBrandId(db, locationId);
  const sortOrder = input.sortOrder ?? ((await db.selectFrom("catalog_menu_categories").select(({ fn }) => fn.max("sort_order").as("max_sort")).where("location_id", "=", locationId).executeTakeFirst())?.max_sort ?? -1) + 1;
  const categoryId = `category_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await db.insertInto("catalog_menu_categories").values({ brand_id: brandId, location_id: locationId, category_id: categoryId, title: input.title, description: input.description, visible: input.visible, sort_order: sortOrder }).execute();
  return (await getRelationalAdminMenu(db, locationId)).categories.find((category) => category.categoryId === categoryId);
}

export async function updateRelationalCategory(db: PersistenceDb, locationId: string, rawInput: AdminMenuCategoryUpdate) {
  await assertPlatformManaged(db, locationId);
  const input = adminMenuCategoryUpdateSchema.parse(rawInput);
  const row = await db.updateTable("catalog_menu_categories").set({ title: input.title, description: input.description, visible: input.visible, sort_order: input.sortOrder, updated_at: new Date().toISOString() }).where("location_id", "=", locationId).where("category_id", "=", input.categoryId).returning("category_id").executeTakeFirst();
  if (!row) return undefined;
  return (await getRelationalAdminMenu(db, locationId)).categories.find((category) => category.categoryId === input.categoryId);
}

export async function reorderRelationalCategories(db: PersistenceDb, locationId: string, categoryIds: string[]) {
  await assertPlatformManaged(db, locationId);
  const current = await db.selectFrom("catalog_menu_categories").select(["category_id"]).where("location_id", "=", locationId).execute();
  const requested = new Set(categoryIds);
  const ordered = [...categoryIds, ...current.map((category) => category.category_id).filter((id) => !requested.has(id))];
  const sortOrderByCategoryId = new Map(ordered.map((categoryId, sortOrder) => [categoryId, sortOrder]));
  await db.transaction().execute(async (trx) => {
    // Acquire row locks in a stable order so concurrent reorders cannot
    // deadlock when their requested orders are opposites.
    for (const categoryId of [...ordered].sort()) {
      await trx.updateTable("catalog_menu_categories").set({ sort_order: sortOrderByCategoryId.get(categoryId) ?? 0, updated_at: new Date().toISOString() }).where("location_id", "=", locationId).where("category_id", "=", categoryId).execute();
    }
  });
  return getRelationalAdminMenu(db, locationId);
}

export async function deleteRelationalCategory(db: PersistenceDb, locationId: string, categoryId: string) {
  await assertPlatformManaged(db, locationId);
  const memberships = await db.selectFrom("catalog_menu_category_items").select(["item_id"]).where("location_id", "=", locationId).where("category_id", "=", categoryId).execute();
  const itemIds = memberships.map((membership) => membership.item_id);
  if (itemIds.length > 0) {
    const otherMemberships = await db.selectFrom("catalog_menu_category_items").select(["item_id"]).where("location_id", "=", locationId).where("category_id", "!=", categoryId).where("item_id", "in", itemIds).execute();
    const covered = new Set(otherMemberships.map((membership) => membership.item_id));
    const orphaned = itemIds.filter((itemId) => !covered.has(itemId));
    if (orphaned.length > 0) {
      throw new CatalogMutationError("CATEGORY_HAS_ORPHANED_ITEMS", "Move items to another category before deleting this category.", 409, { itemIds: orphaned });
    }
  }
  const deleted = await db.transaction().execute(async (trx) => {
    // Keep the legacy primary-category columns internally consistent while
    // they remain available for rollback and older readers.
    for (const itemId of itemIds) {
      const replacement = await trx
        .selectFrom("catalog_menu_category_items")
        .select(["category_id", "sort_order"])
        .where("location_id", "=", locationId)
        .where("item_id", "=", itemId)
        .where("category_id", "!=", categoryId)
        .orderBy("sort_order")
        .orderBy("category_id")
        .executeTakeFirst();
      if (replacement) {
        await trx
          .updateTable("catalog_menu_items")
          .set({ category_id: replacement.category_id, sort_order: replacement.sort_order, updated_at: new Date().toISOString() })
          .where("location_id", "=", locationId)
          .where("item_id", "=", itemId)
          .where("category_id", "=", categoryId)
          .execute();
      }
    }
    return trx
      .deleteFrom("catalog_menu_categories")
      .where("location_id", "=", locationId)
      .where("category_id", "=", categoryId)
      .returning("category_id")
      .executeTakeFirst();
  });
  return Boolean(deleted);
}

export async function createRelationalModifierGroup(db: PersistenceDb, locationId: string, rawInput: AdminModifierGroupCreate) {
  await assertPlatformManaged(db, locationId);
  const input = adminModifierGroupCreateSchema.parse(rawInput);
  const brandId = await getBrandId(db, locationId);
  const groupId = input.id ?? `modifier_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await db.transaction().execute(async (trx) => {
    await trx.insertInto("catalog_modifier_groups").values({ brand_id: brandId, location_id: locationId, modifier_group_id: groupId, label: input.label, description: input.description, source_group_id: input.sourceGroupId ?? null, display_style: input.displayStyle ?? null, selection_type: input.selectionType, required: input.required, min_selections: input.minSelections, max_selections: input.maxSelections, sort_order: input.sortOrder, updated_at: new Date().toISOString() }).execute();
    await trx.insertInto("catalog_modifier_options").values(input.options.map((option) => ({ brand_id: brandId, location_id: locationId, modifier_group_id: groupId, option_id: option.id, label: option.label, description: option.description, price_delta_cents: option.priceDeltaCents, is_default: option.default, available: option.available, display_style: option.displayStyle ?? null, sort_order: option.sortOrder, updated_at: new Date().toISOString() }))).execute();
  });
  return (await getRelationalAdminMenu(db, locationId)).modifierGroups.find((group) => group.id === groupId);
}

export async function updateRelationalModifierGroup(db: PersistenceDb, locationId: string, rawInput: AdminModifierGroupUpdate) {
  await assertPlatformManaged(db, locationId);
  const input = adminModifierGroupUpdateSchema.parse(rawInput);
  const existing = await db.selectFrom("catalog_modifier_groups").select("modifier_group_id").where("location_id", "=", locationId).where("modifier_group_id", "=", input.id).executeTakeFirst();
  if (!existing) return undefined;
  const brandId = await getBrandId(db, locationId);
  const existingAssignments = await db
    .selectFrom("catalog_item_modifier_groups")
    .selectAll()
    .where("location_id", "=", locationId)
    .where("modifier_group_id", "=", input.id)
    .execute();
  validateModifierGroupAssignmentOverrides(
    {
      id: input.id,
      selectionType: input.selectionType,
      minSelections: input.minSelections,
      maxSelections: input.maxSelections
    },
    existingAssignments.map((assignment) => ({
      modifierGroupId: assignment.modifier_group_id,
      sortOrder: assignment.sort_order,
      requiredOverride: assignment.required_override,
      minSelectionsOverride: assignment.min_selections_override,
      maxSelectionsOverride: assignment.max_selections_override
    }))
  );
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("catalog_modifier_groups").set({ label: input.label, description: input.description, source_group_id: input.sourceGroupId ?? null, display_style: input.displayStyle ?? null, selection_type: input.selectionType, required: input.required, min_selections: input.minSelections, max_selections: input.maxSelections, sort_order: input.sortOrder, updated_at: new Date().toISOString() }).where("location_id", "=", locationId).where("modifier_group_id", "=", input.id).execute();
    await trx.deleteFrom("catalog_modifier_options").where("location_id", "=", locationId).where("modifier_group_id", "=", input.id).execute();
    await trx.insertInto("catalog_modifier_options").values(input.options.map((option) => ({ brand_id: brandId, location_id: locationId, modifier_group_id: input.id, option_id: option.id, label: option.label, description: option.description, price_delta_cents: option.priceDeltaCents, is_default: option.default, available: option.available, display_style: option.displayStyle ?? null, sort_order: option.sortOrder, updated_at: new Date().toISOString() }))).execute();
  });
  return (await getRelationalAdminMenu(db, locationId)).modifierGroups.find((group) => group.id === input.id);
}

export async function deleteRelationalModifierGroup(db: PersistenceDb, locationId: string, modifierGroupId: string) {
  await assertPlatformManaged(db, locationId);
  const assigned = await db.selectFrom("catalog_item_modifier_groups").select("item_id").where("location_id", "=", locationId).where("modifier_group_id", "=", modifierGroupId).execute();
  if (assigned.length > 0) {
    throw new CatalogMutationError("MODIFIER_GROUP_IN_USE", "Remove this modifier group from its items before deleting it.", 409, { itemIds: assigned.map((row) => row.item_id) });
  }
  return Boolean(await db.deleteFrom("catalog_modifier_groups").where("location_id", "=", locationId).where("modifier_group_id", "=", modifierGroupId).returning("modifier_group_id").executeTakeFirst());
}

/**
 * Compatibility adapter for older admin clients that still submit embedded
 * customizationGroups. New writes should use reusable group assignments; this
 * keeps an older client from silently losing its edits during the migration.
 */
export async function replaceRelationalItemEmbeddedGroupsInTransaction(
  db: PersistenceDb,
  locationId: string,
  itemId: string,
  rawGroups: unknown,
  brandId: string
) {
  const groups = menuItemCustomizationGroupSchema.array().parse(rawGroups);
  await db.deleteFrom("catalog_item_modifier_groups").where("location_id", "=", locationId).where("item_id", "=", itemId).execute();
  for (const group of groups) {
    const modifierGroupId = scopedLegacyGroupId(locationId, itemId, group.id);
    await db
      .insertInto("catalog_modifier_groups")
      .values({
        brand_id: brandId,
        location_id: locationId,
        modifier_group_id: modifierGroupId,
        label: group.label,
        description: group.description ?? "",
        source_group_id: group.sourceGroupId ?? null,
        display_style: group.displayStyle ?? null,
        selection_type: group.selectionType,
        required: group.required,
        min_selections: group.minSelections,
        max_selections: group.maxSelections,
        sort_order: group.sortOrder,
        updated_at: new Date().toISOString()
      })
      .onConflict((conflict) => conflict.columns(["location_id", "modifier_group_id"]).doUpdateSet({
        label: group.label,
        description: group.description ?? "",
        source_group_id: group.sourceGroupId ?? null,
        display_style: group.displayStyle ?? null,
        selection_type: group.selectionType,
        required: group.required,
        min_selections: group.minSelections,
        max_selections: group.maxSelections,
        sort_order: group.sortOrder,
        updated_at: new Date().toISOString()
      }))
      .execute();
    await db.deleteFrom("catalog_modifier_options").where("location_id", "=", locationId).where("modifier_group_id", "=", modifierGroupId).execute();
    await db.insertInto("catalog_modifier_options").values(group.options.map((option) => ({
      brand_id: brandId,
      location_id: locationId,
      modifier_group_id: modifierGroupId,
      option_id: option.id,
      label: option.label,
      description: option.description ?? "",
      price_delta_cents: option.priceDeltaCents,
      is_default: option.default,
      available: option.available,
      display_style: option.displayStyle ?? null,
      sort_order: option.sortOrder,
      updated_at: new Date().toISOString()
    }))).execute();
    await db.insertInto("catalog_item_modifier_groups").values({
      brand_id: brandId,
      location_id: locationId,
      item_id: itemId,
      modifier_group_id: modifierGroupId,
      sort_order: group.sortOrder,
      required_override: null,
      min_selections_override: null,
      max_selections_override: null,
      updated_at: new Date().toISOString()
    }).execute();
  }
}

export async function replaceRelationalItemEmbeddedGroups(
  db: PersistenceDb,
  locationId: string,
  itemId: string,
  rawGroups: unknown,
  brandId: string
) {
  await db.transaction().execute(async (trx) => {
    await replaceRelationalItemEmbeddedGroupsInTransaction(trx as unknown as PersistenceDb, locationId, itemId, rawGroups, brandId);
  });
}

export async function replaceRelationalMenuFromExternalInTransaction(
  db: PersistenceDb,
  locationId: string,
  menu: MenuResponse,
  brandIdOverride?: string
) {
  const brandId = brandIdOverride ?? await getBrandId(db, locationId);
  const sourceGroupIds = new Map<string, Set<string>>();
  for (const category of menu.categories) {
    for (const item of category.items) {
      for (const group of item.customizationGroups) {
        if (!group.sourceGroupId) continue;
        const itemLocalIds = sourceGroupIds.get(group.sourceGroupId) ?? new Set<string>();
        itemLocalIds.add(group.id);
        sourceGroupIds.set(group.sourceGroupId, itemLocalIds);
      }
    }
  }
  const groupsById = new Map<string, { group: LegacyCustomizationGroup; itemIds: string[] }>();
  for (const category of menu.categories) {
    for (const item of category.items) {
      for (const group of item.customizationGroups) {
        const modifierGroupId = sourceScopedGroupId(locationId, item.id, group, sourceGroupIds);
        const existing = groupsById.get(modifierGroupId);
        if (existing) {
          const existingShape = JSON.stringify({ ...existing.group, options: existing.group.options.map((option) => ({ ...option })) });
          const nextShape = JSON.stringify({ ...group, options: group.options.map((option) => ({ ...option })) });
          if (existingShape !== nextShape) {
            throw new CatalogMutationError("MODIFIER_GROUP_CONFLICT", `External menu source returned conflicting definitions for modifier group ${modifierGroupId}.`, 422, { modifierGroupId });
          }
          if (!existing.itemIds.includes(item.id)) {
            existing.itemIds.push(item.id);
          }
        } else {
          groupsById.set(modifierGroupId, { group, itemIds: [item.id] });
        }
      }
    }
  }

  const trx = db;
  {
    await trx.deleteFrom("catalog_item_modifier_groups").where("location_id", "=", locationId).execute();
    await trx.deleteFrom("catalog_menu_category_items").where("location_id", "=", locationId).execute();
    await trx.deleteFrom("catalog_modifier_groups").where("location_id", "=", locationId).execute();
    await trx.deleteFrom("catalog_menu_items").where("location_id", "=", locationId).execute();
    await trx.deleteFrom("catalog_menu_categories").where("location_id", "=", locationId).execute();

    await trx.insertInto("catalog_menu_categories").values(menu.categories.map((category, sortOrder) => ({ brand_id: brandId, location_id: locationId, category_id: category.id, title: category.title, description: category.description, visible: category.visible, sort_order: sortOrder, updated_at: new Date().toISOString() }))).execute();
    const items = menu.categories.flatMap((category) => category.items.map((item, itemSortOrder) => ({ category, item, itemSortOrder })));
    const uniqueItems = new Map(items.map(({ item, category, itemSortOrder }) => [item.id, { item, category, itemSortOrder }]));
    await trx.insertInto("catalog_menu_items").values(Array.from(uniqueItems.values()).map(({ item, category, itemSortOrder }) => ({ brand_id: brandId, location_id: locationId, item_id: item.id, category_id: category.id, name: item.name, description: item.description, image_url: item.imageUrl ?? null, price_cents: item.priceCents, badge_codes_json: JSON.stringify(item.badgeCodes), customization_groups_json: JSON.stringify(item.customizationGroups), visible: item.visible, available: item.available, featured: item.featured, sort_order: itemSortOrder, updated_at: new Date().toISOString() }))).execute();
    await trx.insertInto("catalog_menu_category_items").values(items.map(({ category, item, itemSortOrder }) => ({ brand_id: brandId, location_id: locationId, category_id: category.id, item_id: item.id, sort_order: itemSortOrder, updated_at: new Date().toISOString() }))).execute();

    for (const [modifierGroupId, entry] of groupsById) {
      const group = entry.group;
      await trx.insertInto("catalog_modifier_groups").values({ brand_id: brandId, location_id: locationId, modifier_group_id: modifierGroupId, label: group.label, description: group.description ?? "", source_group_id: group.sourceGroupId ?? null, display_style: group.displayStyle ?? null, selection_type: group.selectionType, required: group.required, min_selections: group.minSelections, max_selections: group.maxSelections, sort_order: group.sortOrder, updated_at: new Date().toISOString() }).execute();
      await trx.insertInto("catalog_modifier_options").values(group.options.map((option) => ({ brand_id: brandId, location_id: locationId, modifier_group_id: modifierGroupId, option_id: sourceScopedOptionId(modifierGroupId, option.id), label: option.label, description: option.description ?? "", price_delta_cents: option.priceDeltaCents, is_default: option.default, available: option.available, display_style: option.displayStyle ?? null, sort_order: option.sortOrder, updated_at: new Date().toISOString() }))).execute();
      for (const itemId of entry.itemIds) {
        await trx.insertInto("catalog_item_modifier_groups").values({ brand_id: brandId, location_id: locationId, item_id: itemId, modifier_group_id: modifierGroupId, sort_order: group.sortOrder, required_override: null, min_selections_override: null, max_selections_override: null, updated_at: new Date().toISOString() }).execute();
      }
    }
  }
}

export async function replaceRelationalMenuFromExternal(db: PersistenceDb, locationId: string, menu: MenuResponse) {
  await db.transaction().execute(async (trx) => {
    await replaceRelationalMenuFromExternalInTransaction(trx as unknown as PersistenceDb, locationId, menu);
  });
  return getRelationalPublicMenu(db, locationId);
}
