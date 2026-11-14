import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSearchFocus } from "../src/search/useSearchFocus";

const runtime = vi.hoisted(() => ({
  platform: "ios", index: 0,
  effect: undefined as undefined | (() => () => void),
  listener: undefined as undefined | ((event: { target?: string; data?: { isPrevented?: boolean } }) => void),
  keyboardHide: undefined as undefined | (() => void),
  unsubscribe: vi.fn(), removeKeyboard: vi.fn(), dismiss: vi.fn(),
  frames: new Map<number, FrameRequestCallback>(), nextFrame: 0,
  navigation: {
    getState: () => ({ index: runtime.index, routes: [{ key: "search-key", name: "search" }, { key: "home-key", name: "home" }] }),
    addListener: vi.fn()
  }
}));
vi.mock("react", () => ({ useRef: (value: unknown) => ({ current: value }), useCallback: (callback: unknown) => callback }));
vi.mock("expo-router", () => ({ useNavigation: () => runtime.navigation, useFocusEffect: (effect: () => () => void) => { runtime.effect = effect; } }));
vi.mock("react-native", () => ({
  Platform: { get OS() { return runtime.platform; } },
  Keyboard: { dismiss: runtime.dismiss, addListener: (_: string, listener: () => void) => { runtime.keyboardHide = listener; return { remove: runtime.removeKeyboard }; } }
}));
function flushFrames() {
  const frames = [...runtime.frames.values()]; runtime.frames.clear();
  frames.forEach((callback) => callback(0));
}
function tapSearch() { runtime.listener?.({ target: "search-key" }); flushFrames(); }
function mountSearch() {
  const refs = useSearchFocus(); const focus = vi.fn(); const blur = vi.fn();
  refs.nativeSearchRef.current = { focus, blur, clearText: vi.fn(), toggleCancelButton: vi.fn(), setText: vi.fn(), cancelSearch: vi.fn() };
  const dispose = runtime.effect?.(); return { refs, focus, blur, dispose };
}
describe("Search tab toggle", () => {
  beforeEach(() => {
    runtime.platform = "ios"; runtime.index = 0; runtime.frames.clear(); vi.clearAllMocks();
    runtime.navigation.addListener.mockImplementation((_event, listener) => { runtime.listener = listener; return runtime.unsubscribe; });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const frame = ++runtime.nextFrame; runtime.frames.set(frame, callback); return frame; });
    vi.stubGlobal("cancelAnimationFrame", (frame: number) => runtime.frames.delete(frame));
  });
  it.each(["ios", "android"])("enters without autofocus, then toggles focus and dismissal on %s", (platform) => {
    runtime.platform = platform;
    const search = mountSearch(); flushFrames(); expect(search.focus).not.toHaveBeenCalled();
    tapSearch(); expect(search.focus).toHaveBeenCalledTimes(1);
    tapSearch(); expect(search.blur).toHaveBeenCalledTimes(1); expect(runtime.dismiss).toHaveBeenCalledTimes(1);
    tapSearch(); expect(search.focus).toHaveBeenCalledTimes(2);
    expect(search.refs.nativeSearchRef.current?.clearText).not.toHaveBeenCalled(); search.dispose?.();
  });
  it("ignores first-entry, other-tab and prevented presses", () => {
    const search = mountSearch(); runtime.index = 1; tapSearch(); runtime.index = 0;
    runtime.listener?.({ target: "home-key" }); runtime.listener?.({ target: "search-key", data: { isPrevented: true } });
    flushFrames(); expect(search.focus).not.toHaveBeenCalled(); search.dispose?.();
  });
  it("tracks manual focus and system keyboard dismissal", () => {
    const search = mountSearch(); search.refs.onSearchFocus(); tapSearch(); expect(search.blur).toHaveBeenCalledTimes(1);
    tapSearch(); runtime.keyboardHide?.(); tapSearch(); expect(search.focus).toHaveBeenCalledTimes(2);
    search.refs.onSearchBlur(); tapSearch(); expect(search.focus).toHaveBeenCalledTimes(3); search.dispose?.();
  });
  it("cancels pending callbacks and subscriptions on leaving", () => {
    const search = mountSearch(); runtime.listener?.({ target: "search-key" });
    const stale = [...runtime.frames.values()][0]; search.dispose?.();
    expect(runtime.unsubscribe).toHaveBeenCalledOnce(); expect(runtime.removeKeyboard).toHaveBeenCalledOnce();
    expect(runtime.frames.size).toBe(0); stale(0); tapSearch(); expect(search.focus).not.toHaveBeenCalled();
  });
  it("returns unfocused without accumulating subscriptions", () => {
    const search = mountSearch(); tapSearch(); search.dispose?.(); const dispose = runtime.effect?.(); flushFrames();
    expect(search.focus).toHaveBeenCalledTimes(1); tapSearch(); expect(search.focus).toHaveBeenCalledTimes(2); dispose?.();
    expect(runtime.unsubscribe).toHaveBeenCalledTimes(2); expect(runtime.removeKeyboard).toHaveBeenCalledTimes(2);
  });
  it("cancels rapid repeated taps before focus", () => {
    const search = mountSearch(); runtime.listener?.({ target: "search-key" }); runtime.listener?.({ target: "search-key" }); flushFrames();
    expect(search.focus).not.toHaveBeenCalled(); search.dispose?.();
  });
});
