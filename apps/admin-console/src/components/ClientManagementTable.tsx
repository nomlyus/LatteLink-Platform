"use client";

import { useState } from "react";
import Link from "next/link";
import type { InternalLocationSummary } from "@lattelink/contracts-catalog";

type ClientManagementTableProps = {
  locations: InternalLocationSummary[];
};

function getClientMark(label: string) {
  const colors = ["#4a7eff", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#0f766e", "#2563eb"];
  const hash = label.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[hash % colors.length] ?? colors[0];
}

export function ClientManagementTable({ locations }: ClientManagementTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredLocations = locations.filter((location) => {
    if (!normalizedQuery) {
      return true;
    }

    return [
      location.brandName,
      location.locationName,
      location.brandId,
      location.locationId,
      location.marketLabel,
      location.storeName
    ].some((value) => value.toLowerCase().includes(normalizedQuery));
  });

  const dashboardEnabledCount = locations.filter((location) => location.capabilities.operations.dashboardEnabled).length;
  const externalMenuCount = locations.filter((location) => location.capabilities.menu.source === "external_sync").length;
  const loyaltyVisibleCount = locations.filter((location) => location.capabilities.loyalty.visible).length;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Clients</span>
          <h3>Client management</h3>
          <p>Browse live client locations, then jump into capabilities and owner handoff without leaving the console.</p>
        </div>
        <Link href="/clients/new" className="primary-button">
          Create Client
        </Link>
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <span className="eyebrow">Total Clients</span>
          <strong>{locations.length}</strong>
          <p>All client locations currently visible to the internal API.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Dashboard Enabled</span>
          <strong>{dashboardEnabledCount}</strong>
          <p>Locations where the client dashboard is ready for handoff.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">External Menus</span>
          <strong>{externalMenuCount}</strong>
          <p>Stores currently constrained by an external menu source.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Loyalty Visible</span>
          <strong>{loyaltyVisibleCount}</strong>
          <p>Locations exposing loyalty in the customer experience.</p>
        </article>
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <label className="search-field">
            <span className="sr-only">Search clients</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search clients, locations, or market..."
            />
          </label>
          <span className="table-meta">
            {filteredLocations.length} of {locations.length} clients
          </span>
        </div>

        {filteredLocations.length === 0 ? (
          <div className="empty-state">
            <h4>No clients match that search.</h4>
            <p>Try a client name, location ID, or market label.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Menu</th>
                <th>Fulfillment</th>
                <th>Loyalty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map((location) => (
                <tr key={location.locationId}>
                  <td>
                    <div className="client-cell">
                      <div className="client-mark" style={{ backgroundColor: getClientMark(location.brandName) }}>
                        {location.brandName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <strong>{location.brandName}</strong>
                        <span>
                          {location.locationName} · {location.marketLabel}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={location.capabilities.operations.dashboardEnabled ? "status-badge is-healthy" : "status-badge is-warning"}>
                      {location.capabilities.operations.dashboardEnabled ? "Ready" : "Needs setup"}
                    </span>
                  </td>
                  <td>
                    <span className={location.capabilities.menu.source === "platform_managed" ? "menu-badge" : "menu-badge is-external"}>
                      {location.capabilities.menu.source === "platform_managed" ? "Platform" : "External"}
                    </span>
                  </td>
                  <td>{location.capabilities.operations.fulfillmentMode === "staff" ? "Staff managed" : "Time based"}</td>
                  <td>{location.capabilities.loyalty.visible ? "Visible" : "Hidden"}</td>
                  <td>
                    <div className="action-row">
                      <Link href={`/clients/${location.locationId}`} className="table-link">
                        Overview
                      </Link>
                      <Link href={`/clients/${location.locationId}/capabilities`} className="table-link">
                        Capabilities
                      </Link>
                      <Link href={`/clients/${location.locationId}/owner`} className="table-link">
                        Owner
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
