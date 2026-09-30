import type { ReportingResponse } from "@lattelink/contracts-reporting";
import { fetchOperatorReporting, type DashboardLocation, type OperatorSession } from "../../api";
import { isSessionAuthFailure } from "../auth/session-compat";
import {
  getOwnerReportingLocationIds,
  getReportingDateRange,
  reportingErrorCode,
  resolveOwnerReportingTimezone,
  type OwnerPeriod
} from "./owner-home-domain";

export type OwnerReportResult =
  | { status: "ready"; report: ReportingResponse }
  | { status: "error"; error: string }
  | { status: "mixed-timezones" }
  | { status: "cancelled" }
  | { status: "auth-error" };

export type OwnerReportingFetcher = (
  session: OperatorSession,
  locationIds: string[],
  range: { start: string; end: string; granularity: "hour" | "day" },
  signal: AbortSignal
) => Promise<ReportingResponse>;

export async function requestOwnerReport(params: {
  session: OperatorSession;
  locations: readonly DashboardLocation[];
  selectedLocationId: string | "all" | null;
  period: OwnerPeriod;
  signal: AbortSignal;
  fetchReport?: OwnerReportingFetcher;
  now?: Date;
}): Promise<OwnerReportResult> {
  const { session, locations, selectedLocationId, period, signal } = params;
  if (signal.aborted) return { status: "cancelled" };

  const timezone = resolveOwnerReportingTimezone(selectedLocationId, locations);
  if (timezone === "mixed") return { status: "mixed-timezones" };
  const locationIds = getOwnerReportingLocationIds(selectedLocationId, locations);
  if (!timezone || locationIds.length === 0) {
    return { status: "error", error: "Reporting location metadata is unavailable." };
  }

  try {
    const range = getReportingDateRange(period, timezone, params.now);
    const fetchReport = params.fetchReport ?? fetchOperatorReporting;
    const report = await fetchReport(session, locationIds, range, signal);
    return signal.aborted ? { status: "cancelled" } : { status: "ready", report };
  } catch (error) {
    if (signal.aborted) return { status: "cancelled" };
    if (isSessionAuthFailure(error)) return { status: "auth-error" };
    return {
      status: "error",
      error: reportingErrorCode(error) ?? (error instanceof Error ? error.message : "Unable to load reporting data.")
    };
  }
}

export function createOwnerReportRequestEpoch() {
  let epoch = 0;
  return {
    begin() {
      epoch += 1;
      return epoch;
    },
    invalidate() {
      epoch += 1;
    },
    isCurrent(requestEpoch: number) {
      return epoch === requestEpoch;
    }
  };
}
