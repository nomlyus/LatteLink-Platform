"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import type { DashboardLocation, OperatorSession } from "../../api";
import { getAvailableDashboardSectionsFor } from "../../lib/navigation/dashboard-sections";
import { getDashboardDestination } from "../../lib/navigation/dashboard-navigation";
import { getDashboardSectionIcon, getDashboardSectionLabel } from "../../lib/navigation/dashboard-sections";
import type { DashboardSection } from "../../model";
import { formatDashboardHeadingDate, getOperatorInitials } from "../../ui/format";
import { getOperatorRoleLabel } from "../../model";
import { useDashboardSession } from "../../features/auth/session-provider";
import { useDashboardLocation } from "../../features/location/location-provider";

const primarySections: DashboardSection[] = ["overview", "orders", "menu", "cards", "discounts", "experience"];
const operationsSections: DashboardSection[] = ["store", "team"];

function hasMultipleLocations(session: OperatorSession) {
  return new Set([session.operator.locationId, ...(session.operator.locationIds ?? [])]).size > 1;
}

function AccountMenu({ session, storeLabel, onLogout, settingsAvailable }: {
  session: OperatorSession;
  storeLabel: string;
  onLogout: () => void;
  settingsAvailable: boolean;
}) {
  const name = session.operator.displayName ?? "Operator";
  return (
    <details className="dash-account-menu">
      <summary className="dash-account-trigger" aria-label="Open account menu">
        <div className="dash-avatar">{getOperatorInitials(name)}</div>
        <div className="dash-user-meta">
          <div className="dash-user-name">{name}</div>
          <div className="dash-user-role">{getOperatorRoleLabel(session.operator.role)}</div>
        </div>
        <Image className="dash-account-chevron" src="/icons/operator-v3/account-chevron.svg" width={14} height={14} unoptimized alt="" aria-hidden="true" />
      </summary>
      <div className="dash-account-dropdown" role="menu">
        <div className="dash-account-dropdown__identity">
          <div className="dash-avatar">{getOperatorInitials(name)}</div>
          <div className="dash-account-dropdown__identity-copy">
            <div className="dash-account-dropdown__identity-name">{name}</div>
            <div className="dash-account-dropdown__identity-store">{storeLabel}</div>
          </div>
        </div>
        <button className="dash-account-action" type="button" role="menuitem">
          <Image className="dash-account-action__icon" src="/icons/operator-v3/user-round.svg" width={12} height={12} unoptimized alt="" aria-hidden="true" />
          Account
        </button>
        {settingsAvailable ? (
          <Link className="dash-account-action" href={getDashboardDestination("store").href} role="menuitem">
            <Image className="dash-account-action__icon" src="/icons/operator-v3/settings.svg" width={12} height={12} unoptimized alt="" aria-hidden="true" />
            Settings
          </Link>
        ) : null}
        <button className="dash-account-action dash-account-action--danger" type="button" role="menuitem" onClick={onLogout}>
          <Image className="dash-account-action__icon" src="/icons/operator-v3/log-out.svg" width={12} height={12} unoptimized alt="" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </details>
  );
}

function DashboardNavItem({ section, active }: { section: DashboardSection; active: boolean }) {
  const href = getDashboardDestination(section).href;
  return (
    <Link className={`dash-nav-item ${active ? "dash-nav-item--active" : ""}`} href={href} aria-current={active ? "page" : undefined} title={getDashboardSectionLabel(section)}>
      <span className="dash-nav-item__content">
        <Image className="dash-nav-icon" src={getDashboardSectionIcon(section)} width={18} height={18} unoptimized alt="" aria-hidden="true" />
        <span className="dash-nav-label">{getDashboardSectionLabel(section)}</span>
      </span>
    </Link>
  );
}

function DashboardSidebar({ session, sections, loading, storeLabel, activeSection, onLogout }: {
  session: OperatorSession;
  sections: DashboardSection[];
  loading: boolean;
  storeLabel: string;
  activeSection: DashboardSection;
  onLogout: () => void;
}) {
  const visiblePrimary = primarySections.filter((section) => sections.includes(section));
  const visibleOperations = operationsSections.filter((section) => sections.includes(section));
  const settingsAvailable = sections.includes("store");
  if (loading) {
    return (
      <aside className="dash-sidebar dash-sidebar--loading" aria-label="Dashboard navigation loading" aria-busy="true">
        <div className="dash-sidebar__loading" aria-hidden="true">
          <div className="dash-sidebar__loading-brand"><span className="dash-skeleton dash-skeleton--wordmark" /></div>
          <nav className="dash-sidebar__loading-nav">
            <div className="dash-sidebar__loading-group"><span className="dash-skeleton dash-skeleton--label" />{["long", "medium", "short", "long", "medium", "short"].map((width, index) => <div className="dash-sidebar__loading-item" key={index}><span className="dash-skeleton dash-skeleton--icon" /><span className={`dash-skeleton dash-skeleton--text dash-skeleton--text-${width}`} /></div>)}</div>
            <div className="dash-sidebar__loading-group dash-sidebar__loading-group--secondary"><span className="dash-skeleton dash-skeleton--label" />{["long", "medium"].map((width) => <div className="dash-sidebar__loading-item" key={width}><span className="dash-skeleton dash-skeleton--icon" /><span className={`dash-skeleton dash-skeleton--text dash-skeleton--text-${width}`} /></div>)}</div>
          </nav>
          <div className="dash-sidebar__loading-footer"><span className="dash-skeleton dash-skeleton--avatar" /><span className="dash-skeleton dash-skeleton--account" /></div>
        </div>
      </aside>
    );
  }
  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar__brand">
        <div className="dash-lockup"><div className="dash-lockup__brand"><span className="dash-wordmark">nomly</span><span className="dash-beta-pill">Beta</span></div></div>
      </div>
      <nav className="dash-nav" aria-label="Dashboard sections">
        <div className="dash-nav-group">
          <div className="dash-nav-group__label">Primary</div>
          {visiblePrimary.map((section) => <DashboardNavItem key={section} section={section} active={section === activeSection} />)}
        </div>
        {visibleOperations.length ? (
          <div className="dash-nav-group">
            <div className="dash-nav-group__label">Operations</div>
            {visibleOperations.map((section) => <DashboardNavItem key={section} section={section} active={false} />)}
          </div>
        ) : null}
      </nav>
      <div className="dash-sidebar__footer"><AccountMenu session={session} storeLabel={storeLabel} onLogout={onLogout} settingsAvailable={settingsAvailable} /></div>
    </aside>
  );
}

function DashboardTopbar({ session, title, locations, selectedLocationId, locationStatus, onLocationChange }: {
  session: OperatorSession;
  title: string;
  locations: readonly DashboardLocation[];
  selectedLocationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  onLocationChange: (locationId: string | "all") => void;
}) {
  const showLocationSelector = hasMultipleLocations(session);
  const locationLoading = locationStatus !== "ready";
  return (
    <header className="dash-topbar">
      <div className="dash-page-stack">
        <div className="dash-page-title">{title}</div>
        <DashboardPageDate loading={locationLoading} />
      </div>
      <div className="dash-global-search" aria-hidden="true">
        <Image className="dash-global-search__icon" src="/icons/operator-v3/search.svg" width={18} height={18} unoptimized alt="" />
        <span>⌘ + K</span>
      </div>
      {showLocationSelector ? (
        <label className="field dash-field-inline dash-location-picker">
          <span>Workspace</span>
          <select value={selectedLocationId ?? ""} disabled={locationLoading} onChange={(event) => onLocationChange(event.target.value)}>
            <option value="all">All locations</option>
            {locations.map((location) => <option key={location.locationId} value={location.locationId}>{location.locationName} · {location.marketLabel}</option>)}
          </select>
        </label>
      ) : null}
      <div className="dash-notification-button" role="img" aria-label="Notifications">
        <Image src="/icons/operator-v3/notifications.svg" width={36} height={36} unoptimized alt="" aria-hidden="true" />
      </div>
    </header>
  );
}

function DashboardPageDate({ loading }: { loading: boolean }) {
  const [date, setDate] = useState("");
  useEffect(() => setDate(formatDashboardHeadingDate()), []);
  return loading || !date ? <span className="dash-skeleton dash-page-date-skeleton" aria-hidden="true" /> : <div className="dash-page-date">{date}</div>;
}

export function DashboardShellView({
  session,
  activeSection = "overview",
  locations,
  selectedLocationId,
  locationStatus,
  children,
  notice,
  onSelectLocation,
  onLogout
}: {
  session: OperatorSession;
  activeSection?: DashboardSection;
  locations: readonly DashboardLocation[];
  selectedLocationId: string | "all" | null;
  locationStatus: "idle" | "loading" | "ready" | "error";
  children: ReactNode;
  notice?: string | null;
  onSelectLocation: (locationId: string | "all") => void;
  onLogout: () => void;
}) {
  const loading = locationStatus === "idle" || locationStatus === "loading";
  const sections = getAvailableDashboardSectionsFor(session.operator, locations);
  const selected = locations.find((location) => location.locationId === selectedLocationId);
  const storeLabel = selectedLocationId === "all" ? "All locations" : selected?.storeName ?? selected?.locationName ?? "Store";
  return (
    <div className="dash-shell">
      <DashboardSidebar session={session} sections={sections} loading={loading} storeLabel={storeLabel} activeSection={activeSection} onLogout={onLogout} />
      <div className="dash-main">
        <DashboardTopbar session={session} title={getDashboardSectionLabel(activeSection)} locations={locations} selectedLocationId={selectedLocationId} locationStatus={locationStatus} onLocationChange={onSelectLocation} />
        <div className={`dash-content dash-content--${activeSection === "overview" ? "home" : activeSection}`}>
          {notice ? <div className="banner banner--notice" role="status">{notice}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

export function DashboardShell({ children, notice, activeSection = "overview" }: { children: ReactNode; notice?: string | null; activeSection?: DashboardSection }) {
  const { session, logout } = useDashboardSession();
  const location = useDashboardLocation();
  useEffect(() => {
    if (session) void location.loadAvailableLocations();
  }, [session, location.loadAvailableLocations]);

  if (!session) return null;
  return (
    <DashboardShellView
      session={session}
      activeSection={activeSection}
      locations={location.availableLocations}
      selectedLocationId={location.selectedLocationId}
      locationStatus={location.status}
      notice={notice}
      onSelectLocation={(locationId) => { location.selectLocation(locationId); }}
      onLogout={() => { void logout(); }}
    >
      {children}
    </DashboardShellView>
  );
}

export function DashboardShellLoading() {
  return (
    <div className="dash-shell" aria-busy="true">
      <aside className="dash-sidebar dash-sidebar--loading">
        <div className="dash-sidebar__loading" aria-hidden="true">
          <div className="dash-sidebar__loading-brand"><span className="dash-skeleton dash-skeleton--wordmark" /></div>
          <nav className="dash-sidebar__loading-nav">
            <div className="dash-sidebar__loading-group"><span className="dash-skeleton dash-skeleton--label" />{["long", "medium", "short", "long", "medium", "short"].map((width, index) => <div className="dash-sidebar__loading-item" key={index}><span className="dash-skeleton dash-skeleton--icon" /><span className={`dash-skeleton dash-skeleton--text dash-skeleton--text-${width}`} /></div>)}</div>
            <div className="dash-sidebar__loading-group dash-sidebar__loading-group--secondary"><span className="dash-skeleton dash-skeleton--label" />{["long", "medium"].map((width) => <div className="dash-sidebar__loading-item" key={width}><span className="dash-skeleton dash-skeleton--icon" /><span className={`dash-skeleton dash-skeleton--text dash-skeleton--text-${width}`} /></div>)}</div>
          </nav>
          <div className="dash-sidebar__loading-footer"><span className="dash-skeleton dash-skeleton--avatar" /><span className="dash-skeleton dash-skeleton--account" /></div>
        </div>
      </aside>
      <main className="dash-main">
        <header className="dash-topbar"><div className="dash-page-stack"><span className="dash-skeleton dash-skeleton--text dash-skeleton--text-medium" /><span className="dash-skeleton dash-page-date-skeleton" /></div></header>
        <div className="dash-content dash-content--home"><div className="owner-home" aria-label="Loading dashboard"><section className="owner-home-kpis" aria-hidden="true">{[0, 1, 2].map((index) => <div key={index} className="owner-home-kpi owner-home-kpi--skeleton"><span className="owner-home-skeleton owner-home-skeleton--value" /><span className="owner-home-skeleton owner-home-skeleton--label" /><span className="owner-home-skeleton owner-home-skeleton--meta" /></div>)}</section></div></div>
      </main>
    </div>
  );
}
