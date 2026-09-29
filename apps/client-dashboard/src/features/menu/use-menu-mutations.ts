"use client";

import { useCallback, useRef, useState } from "react";
import type {
  AdminMenuCategoryCreate,
  AdminMenuCategoryUpdate,
  AdminMenuItemCreate,
  AdminMenuItemUpdate,
  AdminModifierGroupCreate
} from "@lattelink/contracts-catalog";
import {
  createOperatorMenuCategory,
  createOperatorMenuItem,
  createOperatorModifierGroup,
  deleteOperatorMenuCategory,
  deleteOperatorMenuItem,
  deleteOperatorModifierGroup,
  reorderOperatorMenuCategories,
  updateOperatorMenuCategory,
  updateOperatorMenuItem,
  updateOperatorMenuItemVisibility,
  updateOperatorModifierGroup,
  uploadOperatorMenuItemImage,
  type OperatorSession
} from "../../api";
import { canCreateMenuItems, canToggleMenuItemVisibility, type OperatorMenuItem, type OperatorMenuResponse } from "../../model";
import { getUniqueMenuItems } from "../../menu-page-model";
import { buildMenuItemUpdatePayload, getMenuApiErrorMessage } from "./menu-domain";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";
import { isSessionAuthFailure } from "../auth/session-compat";

type MutationContext = {
  session: OperatorSession | null;
  operatorUserId: string | null;
  locationId: string | "all" | null;
  writeAllowed: boolean;
  visibilityAllowed: boolean;
};

type ItemImageChange = {
  file?: File | null;
  remove?: boolean;
};

export function useMenuMutations(menu: OperatorMenuResponse | null, reload: () => Promise<boolean>) {
  const { session, refreshSession, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const contextRef = useRef<MutationContext>({
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    writeAllowed: canCreateMenuItems(session?.operator, location.selectedLocation?.appConfig),
    visibilityAllowed: canToggleMenuItemVisibility(session?.operator, location.selectedLocation?.appConfig)
  });
  contextRef.current = {
    session,
    operatorUserId: session?.operator.operatorUserId ?? null,
    locationId: location.selectedLocationId,
    writeAllowed: canCreateMenuItems(session?.operator, location.selectedLocation?.appConfig),
    visibilityAllowed: canToggleMenuItemVisibility(session?.operator, location.selectedLocation?.appConfig)
  };
  const menuRef = useRef(menu);
  menuRef.current = menu;

  const run = useCallback(async <T,>(
    operationLabel: string,
    successMessage: string,
    fallbackMessage: string,
    permission: "write" | "visibility",
    operation: (currentSession: OperatorSession, locationId: string) => Promise<T>,
    affectedItemId?: string
  ): Promise<T | null> => {
    if (pendingRef.current) return null;
    const initialContext = contextRef.current;
    if (!initialContext.session) return null;
    if (initialContext.locationId === "all" || !initialContext.locationId) {
      setError("Choose one location before changing its menu.");
      setNotice(null);
      return null;
    }
    if (permission === "write" ? !initialContext.writeAllowed : !initialContext.visibilityAllowed) {
      setError("Menu editing is read only for this location or your current permissions.");
      setNotice(null);
      return null;
    }

    const capturedLocationId = initialContext.locationId;
    const capturedOperatorUserId = initialContext.operatorUserId;
    const isSameScope = () => contextRef.current.locationId === capturedLocationId
      && contextRef.current.operatorUserId === capturedOperatorUserId;

    pendingRef.current = true;
    setPendingOperation(operationLabel);
    setPendingItemId(affectedItemId ?? null);
    setError(null);
    setNotice(null);
    try {
      const currentSession = await refreshSession();
      if (!currentSession) return null;
      if (!isSameScope() || currentSession.operator.operatorUserId !== capturedOperatorUserId) {
        setError("The selected location changed. Review the menu and try again.");
        return null;
      }
      const result = await operation(currentSession, capturedLocationId);
      if (isSameScope()) {
        const reloaded = await reload();
        if (isSameScope()) {
          setNotice(reloaded ? successMessage : `${successMessage} The latest menu could not be reloaded.`);
        }
      }
      return result;
    } catch (mutationError) {
      if (isSessionAuthFailure(mutationError)) void logout();
      if (isSameScope()) {
        // Some menu operations span several existing endpoints. Reload after a failure
        // so a partial server-side result is shown honestly rather than as a stale draft.
        await reload();
        if (isSameScope()) setError(getMenuApiErrorMessage(mutationError, fallbackMessage));
      }
      return null;
    } finally {
      pendingRef.current = false;
      setPendingOperation(null);
      setPendingItemId(null);
    }
  }, [logout, refreshSession, reload]);

  const createItem = useCallback((input: AdminMenuItemCreate) => run(
    "Creating item…", "Item created.", "Unable to create item.", "write",
    (currentSession, locationId) => createOperatorMenuItem(currentSession, locationId, input)
  ), [run]);

  const saveItem = useCallback((item: OperatorMenuItem, input: AdminMenuItemUpdate, imageChange: ItemImageChange = {}) => run(
    "Saving item…", "Item saved.", "Unable to save item.", "write",
    async (currentSession, locationId) => {
      const imageUrl = imageChange.file && imageChange.file.size > 0
        ? await uploadOperatorMenuItemImage(currentSession, locationId, item.itemId, imageChange.file)
        : imageChange.remove && item.imageUrl
          ? null
          : undefined;
      const update = imageUrl === undefined ? input : { ...input, imageUrl };
      return updateOperatorMenuItem(currentSession, locationId, item.itemId, update);
    }, item.itemId
  ), [run]);

  const setItemVisibility = useCallback((itemId: string, visible: boolean) => run(
    "Updating visibility…", visible ? "Item is visible in the customer menu." : "Item is hidden from the customer menu.",
    "Unable to change item visibility.", "visibility",
    (currentSession, locationId) => updateOperatorMenuItemVisibility(currentSession, locationId, itemId, visible),
    itemId
  ), [run]);

  const deleteItem = useCallback((itemId: string) => run(
    "Deleting item…", "Item deleted.", "Unable to delete item.", "write",
    (currentSession, locationId) => deleteOperatorMenuItem(currentSession, locationId, itemId),
    itemId
  ), [run]);

  const createCategory = useCallback((input: AdminMenuCategoryCreate) => run(
    "Creating category…", "Category created.", "Unable to create category.", "write",
    (currentSession, locationId) => createOperatorMenuCategory(currentSession, locationId, input)
  ), [run]);

  const saveCategory = useCallback((categoryId: string, input: AdminMenuCategoryUpdate, memberItemIds: readonly string[]) => run(
    "Saving category…", "Category saved.", "Unable to save category.",
    "write",
    async (currentSession, locationId) => {
      const latestMenu = menuRef.current;
      if (!latestMenu) throw new Error("The menu is no longer available. Reload and try again.");
      const items = getUniqueMenuItems(latestMenu.categories);
      const selectedMembers = new Set(memberItemIds);
      const updates: Array<{ item: OperatorMenuItem; categoryIds: string[] }> = [];
      for (const item of items) {
        const currentIds = item.categoryIds?.length ? item.categoryIds : [item.categoryId];
        const currentlyBelongs = currentIds.includes(categoryId);
        const shouldBelong = selectedMembers.has(item.itemId);
        if (currentlyBelongs === shouldBelong) continue;
        const nextIds = shouldBelong ? [...currentIds, categoryId] : currentIds.filter((id) => id !== categoryId);
        if (nextIds.length === 0) {
          throw new Error(`${item.name} must stay in at least one category. Add another category before removing this membership.`);
        }
        updates.push({ item, categoryIds: nextIds });
      }
      for (const update of updates) {
        await updateOperatorMenuItem(currentSession, locationId, update.item.itemId, buildMenuItemUpdatePayload(update.item, {
          categoryIds: update.categoryIds
        }));
      }
      return updateOperatorMenuCategory(currentSession, locationId, categoryId, input);
    }
  ), [run]);

  const deleteCategory = useCallback((categoryId: string) => run(
    "Deleting category…", "Category deleted. Its items remain in the menu.", "Unable to delete category.",
    "write",
    (currentSession, locationId) => {
      const category = menuRef.current?.categories.find((entry) => entry.categoryId === categoryId);
      if (!category) throw new Error("This category is no longer available.");
      const orphanedItems = category.items.filter((item) => (item.categoryIds?.length ?? 1) <= 1);
      if (orphanedItems.length) {
        throw new Error(`Move ${orphanedItems.length} item${orphanedItems.length === 1 ? "" : "s"} to another category first. Deleting this category never deletes the underlying items.`);
      }
      return deleteOperatorMenuCategory(currentSession, locationId, categoryId);
    }
  ), [run]);

  const reorderCategories = useCallback((categoryIds: string[]) => run(
    "Reordering categories…", "Category order saved.", "Unable to reorder categories.", "write",
    (currentSession, locationId) => reorderOperatorMenuCategories(currentSession, locationId, categoryIds)
  ), [run]);

  const reorderCategoryItem = useCallback((categoryId: string, itemId: string, direction: "up" | "down") => run(
    "Reordering items…", "Item order saved.", "Unable to reorder items in this category.", "write",
    async (currentSession, locationId) => {
      const category = menuRef.current?.categories.find((entry) => entry.categoryId === categoryId);
      const ordered = category?.items.filter((item) => item.categoryId === categoryId) ?? [];
      const index = ordered.findIndex((item) => item.itemId === itemId);
      const current = ordered[index];
      const neighbor = ordered[index + (direction === "up" ? -1 : 1)];
      if (!current || !neighbor) throw new Error("The item order changed. Reload and try again.");
      await updateOperatorMenuItem(currentSession, locationId, current.itemId, buildMenuItemUpdatePayload(current, { sortOrder: neighbor.sortOrder }));
      return updateOperatorMenuItem(currentSession, locationId, neighbor.itemId, buildMenuItemUpdatePayload(neighbor, { sortOrder: current.sortOrder }));
    }
  ), [run]);

  const createModifierGroup = useCallback((input: AdminModifierGroupCreate) => run(
    "Creating modifier group…", "Modifier group created.", "Unable to create modifier group.", "write",
    (currentSession, locationId) => createOperatorModifierGroup(currentSession, locationId, input)
  ), [run]);

  const saveModifierGroup = useCallback((modifierGroupId: string, input: AdminModifierGroupCreate) => run(
    "Saving modifier group…", "Modifier group saved.", "Unable to save modifier group.", "write",
    (currentSession, locationId) => updateOperatorModifierGroup(currentSession, locationId, modifierGroupId, { ...input, id: modifierGroupId })
  ), [run]);

  const deleteModifierGroup = useCallback((modifierGroupId: string) => run(
    "Deleting modifier group…", "Modifier group deleted.", "Unable to delete modifier group.", "write",
    (currentSession, locationId) => deleteOperatorModifierGroup(currentSession, locationId, modifierGroupId)
  ), [run]);

  const clearMessages = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    setNotice(null);
  }, []);

  return {
    pendingOperation,
    pendingItemId,
    isMutating: pendingOperation !== null,
    error,
    notice,
    reportError,
    clearMessages,
    createItem,
    saveItem,
    setItemVisibility,
    deleteItem,
    createCategory,
    saveCategory,
    deleteCategory,
    reorderCategories,
    reorderCategoryItem,
    createModifierGroup,
    saveModifierGroup,
    deleteModifierGroup
  };
}
