"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReportingResponse } from "@lattelink/contracts-reporting";
import type { DashboardLocation, OperatorSession } from "../../api";
import type { OwnerChartMetric, OwnerPeriod } from "./owner-home-domain";
import { createOwnerReportRequestEpoch, requestOwnerReport } from "./owner-home-report";
import { useDashboardSession } from "../auth/session-provider";
import { useDashboardLocation } from "../location/location-provider";

type ReportResource = {
  key: string;
  status: "loading" | "ready" | "error" | "mixed-timezones";
  report: ReportingResponse | null;
  error: string | null;
  resolvedOnce: boolean;
};

export type OwnerHomeReportState = Omit<ReportResource, "key" | "resolvedOnce"> & {
  initialLoading: boolean;
  period: OwnerPeriod;
  chartMetric: OwnerChartMetric;
  setPeriod: (period: OwnerPeriod) => void;
  setChartMetric: (metric: OwnerChartMetric) => void;
  retry: () => void;
};

function reportKey(
  session: OperatorSession | null,
  locations: readonly DashboardLocation[],
  selectedLocationId: string | "all" | null,
  period: OwnerPeriod
) {
  return JSON.stringify({
    operatorUserId: session?.operator.operatorUserId,
    apiBaseUrl: session?.apiBaseUrl,
    selectedLocationId,
    locationIds: locations.map(({ locationId, timezone }) => [locationId, timezone]),
    period
  });
}

export function useOwnerHomeReport(): OwnerHomeReportState {
  const { session, logout } = useDashboardSession();
  const location = useDashboardLocation();
  const [period, setPeriod] = useState<OwnerPeriod>("today");
  const [chartMetric, setChartMetric] = useState<OwnerChartMetric>("netSales");
  const [attempt, setAttempt] = useState(0);
  const [resource, setResource] = useState<ReportResource>({
    key: "",
    status: "loading",
    report: null,
    error: null,
    resolvedOnce: false
  });
  const requestEpoch = useRef(createOwnerReportRequestEpoch());

  const key = useMemo(
    () => reportKey(session, location.availableLocations, location.selectedLocationId, period),
    [session, location.availableLocations, location.selectedLocationId, period]
  );

  useEffect(() => {
    if (!session || location.status !== "ready") return;

    const controller = new AbortController();
    const currentEpoch = requestEpoch.current.begin();
    setResource((previous) => ({
      key,
      status: "loading",
      report: null,
      error: null,
      resolvedOnce: previous.resolvedOnce
    }));

    void requestOwnerReport({
      session,
      locations: location.availableLocations,
      selectedLocationId: location.selectedLocationId,
      period,
      signal: controller.signal
    }).then((result) => {
      if (controller.signal.aborted || !requestEpoch.current.isCurrent(currentEpoch)) return;
      if (result.status === "auth-error") {
        void logout();
        return;
      }
      if (result.status === "cancelled") return;
      if (result.status === "ready") {
        setResource({ key, status: "ready", report: result.report, error: null, resolvedOnce: true });
      } else if (result.status === "mixed-timezones") {
        setResource({ key, status: "mixed-timezones", report: null, error: null, resolvedOnce: true });
      } else {
        setResource({ key, status: "error", report: null, error: result.error, resolvedOnce: true });
      }
    });

    return () => {
      controller.abort();
      requestEpoch.current.invalidate();
    };
  }, [key, location.availableLocations, location.selectedLocationId, location.status, logout, period, session, attempt]);

  const retry = useCallback(() => {
    if (location.status === "error") {
      void location.loadAvailableLocations();
      return;
    }
    setAttempt((value) => value + 1);
  }, [location]);

  if (location.status === "error") {
    return {
      status: "error",
      report: null,
      error: location.error ?? "Unable to load authorized locations.",
      initialLoading: false,
      period,
      chartMetric,
      setPeriod,
      setChartMetric,
      retry
    };
  }
  if (location.status !== "ready" || resource.key !== key) {
    return {
      status: "loading",
      report: null,
      error: null,
      initialLoading: !resource.resolvedOnce,
      period,
      chartMetric,
      setPeriod,
      setChartMetric,
      retry
    };
  }
  return {
    status: resource.status,
    report: resource.report,
    error: resource.error,
    initialLoading: !resource.resolvedOnce,
    period,
    chartMetric,
    setPeriod,
    setChartMetric,
    retry
  };
}
