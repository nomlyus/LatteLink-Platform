"use client";

import React from "react";
import Image from "next/image";
import type { OperatorMenuCategory, OperatorMenuItem, OperatorModifierGroup } from "../../../model";
import { getItemCategories } from "../menu-domain";
import { TablePagination } from "../../../components/dashboard/TablePagination";
import { formatMoney } from "../../../ui/format";

const pageSize = 15;

export function MenuItemsPanel({
  items,
  categories,
  modifierGroups,
  query = "",
  page,
  loading,
  canWrite,
  canToggleVisibility,
  pendingItemId,
  onPageChange,
  onAddItem,
  onEdit,
  onAvailabilityChange,
  onVisibilityChange,
  onDelete
}: {
  items: readonly OperatorMenuItem[];
  categories: readonly OperatorMenuCategory[];
  modifierGroups: readonly OperatorModifierGroup[];
  query?: string;
  page: number;
  loading: boolean;
  canWrite: boolean;
  canToggleVisibility: boolean;
  pendingItemId: string | null;
  onPageChange: (page: number) => void;
  onAddItem: () => void;
  onEdit: (item: OperatorMenuItem) => void;
  onAvailabilityChange: (item: OperatorMenuItem, available: boolean) => void;
  onVisibilityChange: (item: OperatorMenuItem, visible: boolean) => void;
  onDelete: (item: OperatorMenuItem) => void;
}) {
  const allItemsCount = new Set(categories.flatMap((category) => category.items.map((item) => item.itemId))).size;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(currentPage * pageSize, items.length);
  const pageItems = items.slice(pageStart, pageEnd);

  return (
    <>
      {loading ? (
        <div className="dash-menu-table-skeleton" aria-label="Loading menu items" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className="dash-menu-table-skeleton__row" />)}</div>
      ) : items.length === 0 ? (
        <div className="dash-menu-empty" role="status">
          {query.trim() ? <><strong>No items match this search</strong><span>Try another search.</span></> : allItemsCount === 0 ? <><strong>No items yet</strong><span>Add your first item to start building this menu.</span>{canWrite && categories.length ? <button className="button button--secondary" type="button" onClick={onAddItem}>Add item</button> : null}</> : <><strong>No items found</strong><span>There are no items in this location.</span></>}
        </div>
      ) : (
        <>
          <div className="dash-order-table-wrap dash-menu-table-wrap">
            <table className="dash-order-table dash-order-table--menu dash-menu-table">
              <thead><tr><th scope="col">Item</th><th scope="col">Category</th><th scope="col" className="dash-order-table__amount-heading">Price</th><th scope="col">Availability</th><th scope="col">Visibility</th><th scope="col" className="dash-menu-table__actions-heading"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>{pageItems.map((item) => {
                const memberships = getItemCategories(item, categories);
                const primary = memberships.find((category) => category.categoryId === item.categoryId) ?? memberships[0];
                const additionalCount = Math.max(0, memberships.length - (primary ? 1 : 0));
                const actionBusy = pendingItemId === item.itemId;
                const groupCount = modifierGroups.filter((group) => item.modifierGroupAssignments.some((assignment) => assignment.modifierGroupId === group.id)).length;
                return (
                  <tr
                    key={item.itemId}
                    className="dash-order-table__row dash-menu-table__row"
                    tabIndex={0}
                    aria-label={`Edit ${item.name}${groupCount ? `, ${groupCount} modifier groups` : ""}`}
                    aria-haspopup="dialog"
                    onClick={() => onEdit(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEdit(item);
                      }
                    }}
                  >
                    <td><div className="dash-order-table__order dash-menu-table__identity">{item.imageUrl ? <Image className="dash-menu-table__image" src={item.imageUrl} width={28} height={28} unoptimized alt="" aria-hidden="true" /> : <span className="dash-menu-table__image dash-menu-table__image--empty" aria-hidden="true" />}<strong className="dash-menu-table__item-name">{item.name}</strong>{item.featured ? <span className="dash-menu-featured" aria-label="Featured">Featured</span> : null}</div></td>
                    <td><span className="dash-menu-category-value" title={memberships.map((category) => category.title).join(", ")}>{primary?.title ?? <span className="dash-menu-muted">Uncategorized</span>}{additionalCount ? <span className="dash-menu-category-extra">+{additionalCount}</span> : null}</span></td>
                    <td className="dash-order-table__amount">{formatMoney(item.priceCents)}</td>
                    <td><span className="dash-menu-state">{item.available ? "Available" : "Sold out"}</span></td>
                    <td><span className="dash-menu-state">{item.visible ? "Visible" : "Hidden"}</span></td>
                    <td className="dash-menu-table__actions" onClick={(event) => event.stopPropagation()}>
                      {canWrite || canToggleVisibility ? <details className="dash-menu-row-actions" onKeyDown={(event) => event.stopPropagation()}>
                        <summary aria-label={`Actions for ${item.name}`} onClick={(event) => event.stopPropagation()}>⋯</summary>
                        <div className="dash-menu-row-actions__popover" role="group" aria-label={`${item.name} actions`}>
                          <button type="button" onClick={() => onEdit(item)}>Edit</button>
                          {canWrite ? <button type="button" disabled={actionBusy} onClick={() => onAvailabilityChange(item, !item.available)}>Mark {item.available ? "sold out" : "available"}</button> : null}
                          {canToggleVisibility ? <button type="button" disabled={actionBusy} onClick={() => onVisibilityChange(item, !item.visible)}>{item.visible ? "Hide" : "Show"}</button> : null}
                          {canWrite ? <button className="dash-menu-row-actions__danger" type="button" disabled={actionBusy} onClick={() => onDelete(item)}>Delete item</button> : null}
                        </div>
                      </details> : <span className="dash-menu-muted">—</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <TablePagination label="Menu items pagination" page={currentPage} pageCount={pageCount}
            start={pageStart} end={pageEnd} total={items.length} onPage={onPageChange} />
        </>
      )}
    </>
  );
}
