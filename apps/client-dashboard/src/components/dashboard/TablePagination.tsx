"use client";

import React from "react";

type TablePaginationProps = {
  label: string;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPage: (page: number) => void;
};

export function TablePagination({ label, page, pageCount, start, end, total, onPage }: TablePaginationProps) {
  if (total === 0) return null;
  const rangeLabel = `${start + 1}–${end} of ${total}`;
  if (pageCount <= 1) return <div className="dash-order-pagination-label">{rangeLabel}</div>;

  return (
    <div className="orders-pagination-row">
      <span className="dash-inline-note">{rangeLabel}</span>
      <nav className="dash-order-pagination" aria-label={label}>
        <button className="dash-order-pagination__control" type="button" onClick={() => onPage(1)} disabled={page === 1} aria-label="First page">«</button>
        <button className="dash-order-pagination__control" type="button" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">‹</button>
        <span className="dash-order-pagination__page" aria-current="page">{page} / {pageCount}</span>
        <button className="dash-order-pagination__control" type="button" onClick={() => onPage(page + 1)} disabled={page === pageCount} aria-label="Next page">›</button>
        <button className="dash-order-pagination__control" type="button" onClick={() => onPage(pageCount)} disabled={page === pageCount} aria-label="Last page">»</button>
      </nav>
    </div>
  );
}
