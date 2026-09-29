import { isOwnerOperator, isStoreOperator } from "../../model";
import type { OperatorUser } from "../../model";
import { getDashboardDestination, legacyOnboardingPath } from "./dashboard-navigation";
import { readStripeReturnParams } from "./route-callbacks";

export type DashboardEntryPlan =
  | { kind: "loading" }
  | { kind: "legacy-auth" }
  | { kind: "legacy-google-callback" }
  | { kind: "redirect"; href: string }
  | { kind: "dashboard"; launchNotice: string | null; stripLaunchParams: boolean };

function preserveSearch(path: string, search: string) {
  return `${path}${search ? `?${search.replace(/^\?/, "")}` : ""}`;
}

export function resolveDashboardEntryPlan(
  sessionStatus: "loading" | "signed-out" | "authenticated",
  operator: Pick<OperatorUser, "role"> | null | undefined,
  search: string
): DashboardEntryPlan {
  const params = new URLSearchParams(search);
  if (params.get("google_auth_callback") === "1") return { kind: "legacy-google-callback" };
  if (sessionStatus === "loading") return { kind: "loading" };
  if (sessionStatus === "signed-out") return { kind: "legacy-auth" };

  const stripe = readStripeReturnParams(search);
  const launchIntent = params.get("intent")?.trim().toLowerCase() === "launch" || params.get("start")?.trim().toLowerCase() === "app";
  if (stripe.returned || stripe.refreshRequested) {
    return { kind: "redirect", href: preserveSearch(legacyOnboardingPath, search) };
  }
  if (isStoreOperator(operator)) {
    return { kind: "redirect", href: preserveSearch(getDashboardDestination("orders").href, search) };
  }
  if (launchIntent && isOwnerOperator(operator)) {
    return { kind: "redirect", href: preserveSearch(legacyOnboardingPath, search) };
  }
  return {
    kind: "dashboard",
    launchNotice: launchIntent ? "Sign in to create and launch your branded app." : null,
    stripLaunchParams: launchIntent
  };
}

export function stripLaunchEntryParams(pathname: string, search: string, hash = "") {
  const params = new URLSearchParams(search);
  params.delete("intent");
  params.delete("start");
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
}
