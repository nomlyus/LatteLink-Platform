import type { NotificationBehavior } from "expo-notifications";
import { describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => {
  type Handler = { handleNotification: () => Promise<NotificationBehavior> };
  let handler: Handler | undefined;
  return {
    state: "active",
    setHandler(value: Handler) { handler = value; },
    getHandler() {
      if (!handler) throw new Error("Notification handler was not installed");
      return handler;
    }
  };
});
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return native.state;
    }
  },
  Platform: { OS: "ios" }
}));
vi.mock("expo-notifications", () => ({ setNotificationHandler: native.setHandler }));
vi.mock("expo-constants", () => ({ default: {} }));
vi.mock("expo-crypto", () => ({}));
vi.mock("expo-secure-store", () => ({}));
vi.mock("../src/account/data", () => ({}));
vi.mock("../src/location/LocationProvider", () => ({}));

import "../src/notifications/usePushNotificationRegistration";

describe("SDK 57 notification presentation", () => {
  it.each(["active", "background", "inactive"])("preserves notification behavior when %s", async (state) => {
    native.state = state;
    const behavior = await native.getHandler().handleNotification();
    expect(behavior).toEqual({
      shouldShowBanner: state !== "active",
      shouldShowList: true,
      shouldPlaySound: state !== "active",
      shouldSetBadge: false
    });
    expect(behavior).not.toHaveProperty("shouldShowAlert");
  });
});
