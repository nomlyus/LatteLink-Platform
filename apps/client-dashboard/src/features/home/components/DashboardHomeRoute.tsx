"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientDashboardRoot } from "../../../app/ClientDashboardRoot";
import { DashboardShell, DashboardShellLoading } from "../../../components/dashboard/DashboardShell";
import { useDashboardSession } from "../../auth/session-provider";
import { OwnerHomePage } from "./OwnerHomePage";
import { OperatorOverviewPage } from "./OperatorOverviewPage";
import { stripLaunchEntryParams, resolveDashboardEntryPlan } from "../../../lib/navigation/dashboard-entry";

export function DashboardHomeRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { status, session } = useDashboardSession();
  const operator = session?.operator;
  const plan = useMemo(() => resolveDashboardEntryPlan(status, operator, search), [operator, search, status]);
  const [launchIntentConsumed, setLaunchIntentConsumed] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);
  const redirectStarted = useRef<string | null>(null);

  useEffect(() => {
    if (plan.kind === "dashboard" && plan.launchNotice) setLaunchNotice(plan.launchNotice);
    if (plan.kind === "redirect" && redirectStarted.current !== plan.href) {
      redirectStarted.current = plan.href;
      router.replace(plan.href);
      return;
    }
    if (plan.kind === "dashboard" && plan.stripLaunchParams && !launchIntentConsumed) {
      window.history.replaceState(window.history.state, "", stripLaunchEntryParams(window.location.pathname, window.location.search, window.location.hash));
      setLaunchIntentConsumed(true);
    }
  }, [launchIntentConsumed, plan, router]);

  if (plan.kind === "legacy-auth" || plan.kind === "legacy-google-callback") {
    return <ClientDashboardRoot />;
  }
  if (plan.kind === "loading" || plan.kind === "redirect" || !session) {
    return <DashboardShellLoading />;
  }

  return (
    <DashboardShell notice={launchNotice}>
      {session.operator.role === "owner" ? <OwnerHomePage /> : <OperatorOverviewPage search={search} />}
    </DashboardShell>
  );
}
