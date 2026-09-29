import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OperatorUser } from "../src/model";
import { TeamCreateDialog } from "../src/features/team/components/TeamCreateDialog";
import { TeamMemberDialog } from "../src/features/team/components/TeamMemberDialog";
import { TeamPage } from "../src/features/team/components/TeamPage";
import type { useTeamMutations } from "../src/features/team/use-team-mutations";

const owner: OperatorUser = {
  operatorUserId: "11111111-1111-4111-8111-111111111111",
  displayName: "Store Owner",
  email: "owner@example.com",
  role: "owner",
  locationId: "location-a",
  locationIds: ["location-a", "location-b"],
  active: true,
  capabilities: ["team:read", "team:write"],
  createdAt: "2026-09-01T10:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z"
};
const manager: OperatorUser = {
  ...owner,
  operatorUserId: "22222222-2222-4222-8222-222222222222",
  displayName: "Avery Quinn",
  email: "avery@example.com",
  role: "manager",
  locationIds: ["location-a"],
  capabilities: ["team:read"]
};
const noop = () => undefined;
const mutations = {
  pendingOperation: null,
  isMutating: false,
  error: null,
  notice: null,
  clearMessages: noop,
  createMember: vi.fn(async () => true),
  updateMember: vi.fn(async () => true),
  removeMember: vi.fn(async () => true)
} as unknown as ReturnType<typeof useTeamMutations>;
const locations = [
  { locationId: "location-a", locationName: "Main Street" },
  { locationId: "location-b", locationName: "Downtown" }
];

function pageProps(members: OperatorUser[] | null, canWrite = true) {
  return {
    members,
    loadStatus: "ready" as const,
    loadError: null,
    scopeKey: "owner:location-a:team:read,team:write",
    selectedLocationId: "location-a" as const,
    selectedLocationName: "Main Street",
    locations,
    currentOperator: owner,
    canWrite,
    mutations,
    onRetry: noop
  };
}

describe("React Team surface", () => {
  it("renders loading, empty, failed, and All Locations states distinctly", () => {
    expect(renderToStaticMarkup(<TeamPage {...pageProps(null)} loadStatus="loading" />)).toContain("Loading team members");
    expect(renderToStaticMarkup(<TeamPage {...pageProps([])} />)).toContain("No operator accounts yet");
    expect(renderToStaticMarkup(<TeamPage {...pageProps(null)} loadStatus="error" loadError="Identity is unavailable" />)).toContain("Identity is unavailable");
    expect(renderToStaticMarkup(<TeamPage {...pageProps([])} selectedLocationId="all" />)).toContain("Choose one location");
  });

  it("shows role, active state, account-wide location context, and owner controls", () => {
    const html = renderToStaticMarkup(<TeamPage {...pageProps([owner, manager])} />);
    expect(html).toContain("2 active accounts");
    expect(html).toContain("Store Owner");
    expect(html).toContain("Avery Quinn");
    expect(html).toContain("Owner");
    expect(html).toContain("Manager");
    expect(html).toContain("Main Street");
    expect(html).toContain("Downtown");
    expect(html).toContain("apply to the account wherever it has access");
    expect(html).toContain("Add team member");
  });

  it("keeps manager views read-only and removes create controls", () => {
    const html = renderToStaticMarkup(<TeamPage {...pageProps([manager], false)} />);
    expect(html).toContain("only operators with team-write permission can make changes");
    expect(html).toContain("View Avery Quinn");
    expect(html).not.toContain("Add team member");
  });

  it("renders direct account creation rather than an invitation workflow", () => {
    const html = renderToStaticMarkup(<TeamCreateDialog locationName="Main Street" pending={false} error={null} onClose={noop} onCreate={async () => true} />);
    expect(html).toContain("This creates an account immediately; it does not send an invitation");
    expect(html).toContain("Temporary password");
    expect(html).toContain("Manager");
    expect(html).toContain("Store screen");
    expect(html).not.toContain("Invite pending");
  });

  it("makes member location access read-only and exposes destructive owner actions only when allowed", () => {
    const memberWithAdditionalLocation = { ...manager, locationIds: ["location-a", "location-b", "location-c"] };
    const html = renderToStaticMarkup(<TeamMemberDialog member={memberWithAdditionalLocation} currentOperatorUserId={owner.operatorUserId} locations={locations} canWrite canDelete pending={false} error={null} onClose={noop} onSave={async () => true} onRemove={async () => true} />);
    expect(html).toContain("Location access cannot be changed from this screen");
    expect(html).toContain("Main Street");
    expect(html).toContain("+1 outside your available locations");
    expect(html).toContain("Remove account");
    expect(html).toContain("Reset password");

    const readOnly = renderToStaticMarkup(<TeamMemberDialog member={manager} currentOperatorUserId={owner.operatorUserId} locations={locations} canWrite={false} canDelete={false} pending={false} error={null} onClose={noop} onSave={async () => false} onRemove={async () => false} />);
    expect(readOnly).toContain("editing is read-only");
    expect(readOnly).not.toContain("Remove account");
    expect(readOnly).not.toContain("Save changes");
  });
});
