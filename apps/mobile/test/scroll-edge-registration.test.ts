import { describe, expect, it, vi } from "vitest";
import { createScrollEdgeRegistration } from "../src/navigation/scrollEdgeRegistration";

function setup() {
  const setStyle = vi.fn();
  const cancelFrame = vi.fn();
  const callbacks: (() => void)[] = [];
  const registration = createScrollEdgeRegistration({
    setStyle, cancelFrame,
    requestFrame: (callback) => callbacks.push(callback)
  });
  return { registration, setStyle, cancelFrame, callbacks };
}

describe("native scroll-edge registration", () => {
  it("applies a changed soft style after the scroll view lays out", () => {
    const { registration, setStyle, callbacks } = setup();
    registration.activate();
    expect(setStyle).not.toHaveBeenCalled();
    registration.onLayout(1);
    expect(setStyle.mock.calls).toEqual([["automatic"]]);
    callbacks[0]();
    expect(setStyle).toHaveBeenLastCalledWith("soft");
  });

  it("ignores callbacks after blur/unmount, including an old callback after refocus", () => {
    const { registration, setStyle, cancelFrame, callbacks } = setup();
    registration.activate();
    registration.onLayout(1);
    registration.deactivate();
    expect(cancelFrame).toHaveBeenCalledWith(1);
    registration.onLayout(1);
    callbacks[0]();
    expect(setStyle.mock.calls).toEqual([["automatic"]]);
    registration.activate();
    callbacks[0]();
    expect(setStyle).not.toHaveBeenCalledWith("soft");
    callbacks[1]();
    expect(setStyle).toHaveBeenLastCalledWith("soft");
  });

  it("re-registers after replacing a signed-out or error state with scroll content", () => {
    const { registration, setStyle, callbacks } = setup();
    registration.activate();
    registration.onLayout(1);
    callbacks[0]();
    registration.onLayout(2);
    expect(setStyle).toHaveBeenLastCalledWith("automatic");
    callbacks[1]();
    expect(setStyle).toHaveBeenLastCalledWith("soft");
    registration.deactivate();
  });

  it("preserves the soft edge through repeated tab returns and layout events for the same scroll view", () => {
    const { registration, setStyle, callbacks } = setup();
    registration.activate();
    registration.onLayout(1);
    callbacks[0]();
    setStyle.mockClear();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      registration.deactivate();
      registration.activate();
      registration.onLayout(1);
    }
    expect(setStyle).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
  });

  it("registers an eagerly mounted inactive tab only when it becomes focused", () => {
    const { registration, setStyle, callbacks } = setup();
    registration.onLayout(1);
    expect(setStyle).not.toHaveBeenCalled();
    registration.activate();
    callbacks[0]();
    expect(setStyle.mock.calls).toEqual([["automatic"], ["soft"]]);
  });
});
