"use client";

import React from "react";
import type { OperatorMenuCategory } from "../../../model";
import { searchMenuCategories } from "../menu-search";

export function MenuCategoriesPanel({
  categories,
  query = "",
  canWrite,
  pending,
  onCreate,
  onOpen,
  onReorder,
  onDelete
}: {
  categories: readonly OperatorMenuCategory[];
  query?: string;
  canWrite: boolean;
  pending: boolean;
  onCreate: () => void;
  onOpen: (category: OperatorMenuCategory) => void;
  onReorder: (categoryId: string, direction: "up" | "down") => void;
  onDelete: (category: OperatorMenuCategory) => void;
}) {
  const matchingCategories = searchMenuCategories(categories, query);
  // Search hides rows, but reorder actions still refer to the full catalog order.
  const positions = new Map(categories.map((category, index) => [category.categoryId, index]));
  return (
    <>
      {matchingCategories.length ? <div className="dash-menu-management-list" role="list" aria-label="Menu categories">
        {matchingCategories.map((category) => {
          const index = positions.get(category.categoryId)!;
          return <div className="dash-menu-management-row" role="listitem" key={category.categoryId}>
          <button className="dash-menu-management-row__main" type="button" onClick={() => onOpen(category)} aria-label={`Edit ${category.title}`}>
            <span className="dash-menu-management-row__name">{category.title}</span>
            <span className="dash-menu-management-row__meta">{category.items.length} item{category.items.length === 1 ? "" : "s"}</span>
          </button>
          {canWrite ? <div className="dash-menu-order-controls"><button type="button" disabled={pending || index === 0} onClick={() => onReorder(category.categoryId, "up")} aria-label={`Move ${category.title} up`}>Up</button><button type="button" disabled={pending || index === categories.length - 1} onClick={() => onReorder(category.categoryId, "down")} aria-label={`Move ${category.title} down`}>Down</button><button className="dash-menu-remove-assignment" type="button" disabled={pending} onClick={() => onDelete(category)}>Delete</button></div> : null}
        </div>;
        })}
      </div> : <div className="dash-menu-empty" role="status"><strong>{query.trim() ? "No categories match this search" : "No categories yet"}</strong><span>{query.trim() ? "Try another search." : "Create a category before adding menu items."}</span>{canWrite && !query.trim() ? <button className="button button--secondary" type="button" onClick={onCreate}>Add category</button> : null}</div>}
    </>
  );
}
