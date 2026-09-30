import { afterEach, describe, expect, it, vi } from "vitest";
import type { OperatorSession } from "../src/api";
import { createOrdersRequestEpoch, mountOrdersRealtime, registerOrdersBrowserLifecycle, startOrdersPolling } from "../src/features/orders/orders-lifecycle";

const session = { apiBaseUrl: "https://api.example.com/v1", accessToken: "test", refreshToken: "refresh", expiresAt: "2099-01-01T00:00:00.000Z", operator: { operatorUserId: "op-1", role: "owner", locationId: "loc-a", capabilities: ["orders:read"] } } as unknown as OperatorSession;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("React Orders lifecycle boundaries", () => {
  it("tears down one stream per mount and ignores callbacks from a disposed route", () => {
    let activeConnections = 0;
    const callbacks: Array<{ onEvent: (event: never) => void; onStateChange: (state: never) => void }> = [];
    const subscribe = vi.fn((args: { onEvent: (event: never) => void; onStateChange: (state: never) => void }) => {
      callbacks.push(args);
      activeConnections += 1;
      return () => { activeConnections -= 1; };
    });
    const received = vi.fn();
    const connectionState = vi.fn();
    const mount = () => mountOrdersRealtime({ session, locationId: "loc-a", onEvent: received, onStateChange: connectionState, subscribe: subscribe as never });

    const leaveFirstRoute = mount();
    expect(activeConnections).toBe(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    leaveFirstRoute();
    leaveFirstRoute();
    expect(activeConnections).toBe(0);
    callbacks[0]!.onStateChange("connected" as never);
    callbacks[0]!.onEvent({} as never);
    expect(connectionState).not.toHaveBeenCalled();
    expect(received).not.toHaveBeenCalled();

    const leaveSecondRoute = mount();
    expect(activeConnections).toBe(1);
    expect(subscribe).toHaveBeenCalledTimes(2);
    leaveSecondRoute();
    expect(activeConnections).toBe(0);
  });

  it("uses and clears one fallback polling interval per active lifecycle", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const stop = startOrdersPolling(refresh);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledOnce();
    stop();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(30_000);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("invalidates older order requests when a newer request or route lifecycle starts", () => {
    const requests = createOrdersRequestEpoch();
    const first = requests.begin();
    const second = requests.begin();
    expect(requests.isCurrent(first)).toBe(false);
    expect(requests.isCurrent(second)).toBe(true);
    requests.invalidate();
    expect(requests.isCurrent(second)).toBe(false);
  });

  it("removes online/offline/visibility listeners on unmount and does not accumulate them", () => {
    const browserWindow = new EventTarget();
    const browserDocument = new EventTarget();
    vi.stubGlobal("window", browserWindow);
    vi.stubGlobal("document", browserDocument);
    const firstHandlers = { online: vi.fn(), offline: vi.fn(), visible: vi.fn() };

    const leaveFirstMount = registerOrdersBrowserLifecycle(firstHandlers);
    browserWindow.dispatchEvent(new Event("online"));
    browserWindow.dispatchEvent(new Event("offline"));
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(firstHandlers.online).toHaveBeenCalledOnce();
    expect(firstHandlers.offline).toHaveBeenCalledOnce();
    expect(firstHandlers.visible).toHaveBeenCalledOnce();
    leaveFirstMount();
    leaveFirstMount();

    const secondHandlers = { online: vi.fn(), offline: vi.fn(), visible: vi.fn() };
    const leaveSecondMount = registerOrdersBrowserLifecycle(secondHandlers);
    browserWindow.dispatchEvent(new Event("online"));
    browserWindow.dispatchEvent(new Event("offline"));
    browserDocument.dispatchEvent(new Event("visibilitychange"));
    expect(firstHandlers.online).toHaveBeenCalledOnce();
    expect(firstHandlers.offline).toHaveBeenCalledOnce();
    expect(firstHandlers.visible).toHaveBeenCalledOnce();
    expect(secondHandlers.online).toHaveBeenCalledOnce();
    expect(secondHandlers.offline).toHaveBeenCalledOnce();
    expect(secondHandlers.visible).toHaveBeenCalledOnce();
    leaveSecondMount();
  });
});
