import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutChangeEvent } from "react-native";
import { useNativeScrollEdge } from "../src/navigation/useNativeScrollEdge";

const host = vi.hoisted(() => {
  let refs: { current: unknown }[] = [];
  let cursor = 0;
  return {
    reset() { refs = []; cursor = 0; },
    render() { cursor = 0; },
    useRef(initial: unknown) {
      const index = cursor++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    focus: undefined as (() => void | (() => void)) | undefined,
    navigation: { setOptions: vi.fn() }
  };
});
vi.mock("react", () => ({ useRef: host.useRef, useCallback: (callback: unknown) => callback }));
vi.mock("expo-router", () => ({
  useNavigation: () => host.navigation,
  useFocusEffect: (effect: () => void | (() => void)) => { host.focus = effect; }
}));

function layout(target: number): LayoutChangeEvent {
  return {
    currentTarget: target, target, bubbles: false, cancelable: false, defaultPrevented: false,
    dispatchConfig: { registrationName: "onLayout" }, eventPhase: 2, isTrusted: true,
    preventDefault() {}, isDefaultPrevented: () => false, stopPropagation() {},
    isPropagationStopped: () => false, persist() {}, timeStamp: 0, type: "layout",
    nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 852 } }
  };
}

describe("native scroll-edge hook lifetime", () => {
  let frames: FrameRequestCallback[];
  beforeEach(() => {
    host.reset();
    host.navigation = { setOptions: vi.fn() };
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  it("retains registration when navigation changes without another native layout event", () => {
    host.render();
    const onLayout = useNativeScrollEdge(true);
    const blur = host.focus?.();
    onLayout(layout(1));
    frames[0](0);
    expect(host.navigation.setOptions).toHaveBeenLastCalledWith({ scrollEdgeEffects: { top: "soft" } });
    if (blur) blur();

    host.navigation = { setOptions: vi.fn() };
    host.render();
    const retainedLayout = useNativeScrollEdge(true);
    host.focus?.();
    expect(frames).toHaveLength(1);
    expect(host.navigation.setOptions).not.toHaveBeenCalled();

    // A genuinely new scroll view still registers through the current navigation object.
    retainedLayout(layout(2));
    frames[1](0);
    expect(host.navigation.setOptions.mock.calls).toEqual([
      [{ scrollEdgeEffects: { top: "automatic" } }],
      [{ scrollEdgeEffects: { top: "soft" } }]
    ]);
  });

  it("does not schedule native work when the installed client lacks the header capability", () => {
    host.render();
    const onLayout = useNativeScrollEdge(false);
    host.focus?.();
    onLayout(layout(1));
    expect(frames).toHaveLength(0);
    expect(host.navigation.setOptions).not.toHaveBeenCalled();
  });
});
