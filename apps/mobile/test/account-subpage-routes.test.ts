import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import SettingsRoute from "../app/(tabs)/account/details/settings";
import RewardsRoute from "../app/(tabs)/account/details/rewards";
import ProfileRoute from "../app/(tabs)/account/details/profile";

vi.stubGlobal("React", React);
vi.mock("../src/account/AccountSheetNavigation", () => ({ useAccountSheetHeaderHeight: () => 70 }));
vi.mock("../app/account/settings", () => ({ default: "SettingsPage" }));
vi.mock("../app/account/rewards", () => ({ default: "RewardsPage" }));
vi.mock("../app/account/alerts", () => ({ default: "ProfilePage" }));

describe("Account subpage initial layout", () => {
  it.each([SettingsRoute, RewardsRoute, ProfileRoute])("passes the already measured native header height before rendering", (route) => {
    expect(route().props).toMatchObject({ presentation: "sheet", contentTopInset: 70 });
  });
});
