import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ role: "manager", settings: vi.fn(), onboarding: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("../src/features/auth/session-provider", () => ({ useDashboardSession: () => ({ status: "authenticated", session: { operator: { role: harness.role, capabilities: ["store:read", "store:write"] } } }) }));
vi.mock("../src/components/dashboard/DashboardShell", () => ({ DashboardShellLoading: () => <div>Loading</div>, DashboardShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../src/features/settings/use-store-settings", () => ({ useStoreSettings: harness.settings }));
vi.mock("../src/features/onboarding/use-onboarding", () => ({ useOnboarding: harness.onboarding }));
import { SettingsRoute } from "../src/features/settings/components/SettingsRoute";

describe("owner-only Settings route", () => {
  it.each(["manager", "store"])("does not mount config or onboarding loaders for %s, even with stale store capabilities", (role) => {
    harness.role = role;
    harness.settings.mockClear();
    harness.onboarding.mockClear();
    const html = renderToStaticMarkup(<SettingsRoute />);
    expect(html).toContain("Loading");
    expect(harness.settings).not.toHaveBeenCalled();
    expect(harness.onboarding).not.toHaveBeenCalled();
    expect(html).not.toContain("Store name");
  });
});
