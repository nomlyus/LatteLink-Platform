import { afterEach, describe, expect, it, vi } from "vitest";
import { registerLegacyBrowserLifecycle } from "../src/legacy/browser-lifecycle";

describe("legacy browser lifecycle boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("cleans online, offline, and visibility listeners on unmount and registers only one set after remount", () => {
    const browser = new EventTarget();
    const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    doc.visibilityState = "visible";
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", doc);
    const handlers = { online: vi.fn(), offline: vi.fn(), visible: vi.fn() };

    const firstMount = new AbortController();
    registerLegacyBrowserLifecycle(firstMount.signal, handlers);
    browser.dispatchEvent(new Event("online"));
    browser.dispatchEvent(new Event("offline"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handlers.online).toHaveBeenCalledTimes(1);
    expect(handlers.offline).toHaveBeenCalledTimes(1);
    expect(handlers.visible).toHaveBeenCalledTimes(1);

    firstMount.abort();
    browser.dispatchEvent(new Event("online"));
    browser.dispatchEvent(new Event("offline"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handlers.online).toHaveBeenCalledTimes(1);
    expect(handlers.offline).toHaveBeenCalledTimes(1);
    expect(handlers.visible).toHaveBeenCalledTimes(1);

    const secondMount = new AbortController();
    registerLegacyBrowserLifecycle(secondMount.signal, handlers);
    browser.dispatchEvent(new Event("online"));
    browser.dispatchEvent(new Event("offline"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(handlers.online).toHaveBeenCalledTimes(2);
    expect(handlers.offline).toHaveBeenCalledTimes(2);
    expect(handlers.visible).toHaveBeenCalledTimes(2);
    secondMount.abort();
  });
});
