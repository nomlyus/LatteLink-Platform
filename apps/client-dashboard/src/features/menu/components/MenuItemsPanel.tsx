"use client";

import React from "react";
import Image from "next/image";
import type { OperatorMenuCategory, OperatorMenuItem, OperatorModifierGroup } from "../../../model";
import { getItemCategories, getPageRange } from "../menu-domain";
import { formatMoney } from "../../../ui/format";

const pageSize = 25;

function asAvailabilityFilter(value: string): "all" | "available" | "sold-out" {
  return value === "available" || value === "sold-out" ? value : "all";
}

function asVisibilityFilter(value: string): "all" | "visible" | "hidden" {
  return value === "visible" || value === "hidden" ? value : "all";
}

export function MenuItemsPanel({
  items,
  categories,
  modifierGroups,
  query,
  categoryFilter,
  availabilityFilter,
  visibilityFilter,
  page,
  loading,
  canWrite,
  canToggleVisibility,
  pendingItemId,
  onQueryChange,
  onCategoryFilterChange,
  onAvailabilityFilterChange,
  onVisibilityFilterChange,
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
  query: string;
  categoryFilter: string;
  availabilityFilter: "all" | "available" | "sold-out";
  visibilityFilter: "all" | "visible" | "hidden";
  page: number;
  loading: boolean;
  canWrite: boolean;
  canToggleVisibility: boolean;
  pendingItemId: string | null;
  onQueryChange: (query: string) => void;
  onCategoryFilterChange: (categoryId: string) => void;
  onAvailabilityFilterChange: (filter: "all" | "available" | "sold-out") => void;
  onVisibilityFilterChange: (filter: "all" | "visible" | "hidden") => void;
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
  const pageItems = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const hasFilters = Boolean(query.trim()) || categoryFilter !== "all" || availabilityFilter !== "all" || visibilityFilter !== "all";

  return (
    <>
      <div className="dash-menu-toolbar" role="search" aria-label="Filter menu items">
        <label className="dash-menu-search field"><span className="visually-hidden">Search items</span><input type="search" placeholder="Search items…" value={query} onChange={(event) => onQueryChange(event.target.value)} /></label>
        <label className="dash-menu-filter"><span className="visually-hidden">Filter by category</span><select aria-label="Filter by category" value={categoryFilter} onChange={(event) => onCategoryFilterChange(event.target.value)}><option value="all">All categories</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.title}</option>)}</select></label>
        <label className="dash-menu-filter"><span className="visually-hidden">Filter by availability</span><select aria-label="Filter by availability" value={availabilityFilter} onChange={(event) => onAvailabilityFilterChange(asAvailabilityFilter(event.target.value))}><option value="all">All availability</option><option value="available">Available</option><option value="sold-out">Sold out</option></select></label>
        <label className="dash-menu-filter"><span className="visually-hidden">Filter by visibility</span><select aria-label="Filter by visibility" value={visibilityFilter} onChange={(event) => onVisibilityFilterChange(asVisibilityFilter(event.target.value))}><option value="all">All visibility</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select></label>
        {canWrite ? <button className="button button--secondary dash-menu-toolbar__add" type="button" onClick={onAddItem}>Add item</button> : null}
      </div>

      {loading ? (
        <div className="dash-menu-table-skeleton" aria-label="Loading menu items" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className="dash-menu-table-skeleton__row" />)}</div>
      ) : items.length === 0 ? (
        <div className="dash-menu-empty" role="status">
          {hasFilters ? <><strong>No items match these filters</strong><span>Try changing the search or filters.</span></> : allItemsCount === 0 ? <><strong>No items yet</strong><span>Add your first item to start building this menu.</span>{canWrite && categories.length ? <button className="button button--secondary" type="button" onClick={onAddItem}>Add item</button> : null}</> : <><strong>No items found</strong><span>There are no items in this location.</span></>}
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
                    <td><div className="dash-order-table__order dash-menu-table__identity">{item.imageUrl ? <Image className="dash-menu-table__image" src={item.imageUrl} width={44} height={44} unoptimized alt="" aria-hidden="true" /> : <span className="dash-menu-table__image dash-menu-table__image--empty" aria-hidden="true" />}<strong className="dash-menu-table__item-name">{item.name}</strong>{item.featured ? <span className="dash-menu-featured" aria-label="Featured">Featured</span> : null}</div></td>
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
          <MenuPagination page={currentPage} pageCount={pageCount} total={items.length} onPageChange={onPageChange} />
        </>
      )}
    </>
  );
}

function MenuPagination({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  if (pageCount <= 1) return <div className="dash-menu-pagination"><span className="dash-menu-pagination__range">{total} item{total === 1 ? "" : "s"}</span></div>;
  const { start, end } = getPageRange(page, pageSize, total);
  const first = Math.max(1, Math.min(page - 2, pageCount - 4));
  const last = Math.min(pageCount, first + 4);
  return <div className="dash-menu-pagination"><span className="dash-menu-pagination__range">{start}–{end} of {total}</span><nav aria-label="Menu items pages" className="dash-menu-pagination__pages"><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}>Previous</button>{Array.from({ length: last - first + 1 }, (_, index) => first + index).map((number) => <button key={number} type="button" aria-label={`Page ${number}`} aria-current={number === page ? "page" : undefined} onClick={() => onPageChange(number)}>{number}</button>)}<button type="button" aria-label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}>Next</button></nav></div>;
}
