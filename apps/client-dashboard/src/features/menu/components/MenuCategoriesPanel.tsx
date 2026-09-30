"use client";

import React from "react";
import type { OperatorMenuCategory } from "../../../model";

export function MenuCategoriesPanel({
  categories,
  canWrite,
  pending,
  onCreate,
  onOpen,
  onReorder,
  onDelete
}: {
  categories: readonly OperatorMenuCategory[];
  canWrite: boolean;
  pending: boolean;
  onCreate: () => void;
  onOpen: (category: OperatorMenuCategory) => void;
  onReorder: (categoryId: string, direction: "up" | "down") => void;
  onDelete: (category: OperatorMenuCategory) => void;
}) {
  return (
    <>
      <div className="dash-menu-list-toolbar"><div><h3>Categories</h3><p>Organize the menu that customers browse.</p></div>{canWrite ? <button className="button button--secondary" type="button" onClick={onCreate}>Add category</button> : null}</div>
      {categories.length ? <div className="dash-menu-management-list" role="list" aria-label="Menu categories">
        {categories.map((category, index) => <div className="dash-menu-management-row" role="listitem" key={category.categoryId}>
          <button className="dash-menu-management-row__main" type="button" onClick={() => onOpen(category)} aria-label={`Edit ${category.title}`}>
            <span className="dash-menu-management-row__name">{category.title}</span>
            <span className="dash-menu-management-row__meta">{category.items.length} item{category.items.length === 1 ? "" : "s"}</span>
          </button>
          {canWrite ? <div className="dash-menu-order-controls"><button type="button" disabled={pending || index === 0} onClick={() => onReorder(category.categoryId, "up")} aria-label={`Move ${category.title} up`}>Up</button><button type="button" disabled={pending || index === categories.length - 1} onClick={() => onReorder(category.categoryId, "down")} aria-label={`Move ${category.title} down`}>Down</button><button className="dash-menu-remove-assignment" type="button" disabled={pending} onClick={() => onDelete(category)}>Delete</button></div> : null}
        </div>)}
      </div> : <div className="dash-menu-empty" role="status"><strong>No categories yet</strong><span>Create a category before adding menu items.</span>{canWrite ? <button className="button button--secondary" type="button" onClick={onCreate}>Add category</button> : null}</div>}
    </>
  );
}
