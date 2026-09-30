import React from "react";
import type { DiscountCodeStatus } from "../discounts-domain";

const statusLabels: Record<DiscountCodeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  upcoming: "Upcoming",
  expired: "Expired",
  exhausted: "Limit reached"
};

export function DiscountStatusBadge({ status }: { status: DiscountCodeStatus }) {
  return (
    <span className={`dash-discounts-status dash-discounts-status--${status}`}>
      <span className="dash-discounts-status__dot" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}
