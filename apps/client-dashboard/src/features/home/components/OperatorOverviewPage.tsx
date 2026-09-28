"use client";

import React from "react";
import { useSyncExternalStore } from "react";
import { useDashboardLocation } from "../../location/location-provider";
import { OwnerHomeStateCard, OwnerHomeStateView, type OwnerHomeFallbackStatus } from "./OwnerHomePage";

const supportedPreviewStates: readonly OwnerHomeFallbackStatus[] = ["loading", "empty", "no-connection", "no-api", "error"];

export function resolveOperatorOverviewState(search: string, online: boolean, locationStatus: string, locationError: string | null) {
  const requestedState = new URLSearchParams(search).get("homeState");
  if (requestedState === "all") return "all" as const;
  if (requestedState && supportedPreviewStates.includes(requestedState as OwnerHomeFallbackStatus)) return requestedState as OwnerHomeFallbackStatus;
  if (!online) return "no-connection" as const;
  if (locationStatus === "idle" || locationStatus === "loading") return "loading" as const;
  if (locationStatus === "error") return locationError === "Unable to reach backend." ? "no-api" as const : "error" as const;
  return "empty" as const;
}

function subscribeToOnlineStatus(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribeToOnlineStatus, getOnlineSnapshot, () => true);
}

export function OperatorOverviewPage({ search }: { search: string }) {
  const location = useDashboardLocation();
  const online = useOnlineStatus();
  const status = resolveOperatorOverviewState(search, online, location.status, location.error);
  if (status === "all") {
    return (
      <section className="dash-overview dash-overview--preview" aria-label="Home">
        {supportedPreviewStates.map((preview) => <OwnerHomeStateCard key={preview} status={preview} />)}
      </section>
    );
  }
  const message = status === "error" ? location.error ?? undefined : undefined;
  return <OwnerHomeStateView status={status} message={message} onRetry={() => { void location.loadAvailableLocations(); }} />;
}
