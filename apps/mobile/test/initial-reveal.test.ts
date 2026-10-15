import { afterEach, describe, expect, it, vi } from "vitest";

// Deterministic hook host: model dependency equality, batched state and passive
// cleanup without adding a deprecated renderer or loading native modules in Node.
const host = vi.hoisted(() => {
  type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };
  let slots: Slot[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: (() => void)[] = [];
  return {
    reset() {
      slots = [];
    },
    render<T>(hook: () => T): T {
      let result: T;
      let passes = 0;
      do {
        if (++passes > 25) throw new Error("Hook did not settle");
        cursor = 0;
        dirty = false;
        effects = [];
        result = hook();
        effects.forEach((effect) => effect());
      } while (dirty);
      return result;
    },
    useRef(value: unknown) {
      const index = cursor++;
      slots[index] ??= { value: { current: value } };
      return slots[index].value;
    },
    useState(value: unknown) {
      const index = cursor++;
      slots[index] ??= { value };
      return [
        slots[index].value,
        (next: unknown) => {
          if (!Object.is(slots[index].value, next)) dirty = true;
          slots[index].value = next;
        }
      ];
    },
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous?.deps?.every((value, i) => Object.is(value, deps[i]))) return;
      slots[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => {
        slots[index].cleanup?.();
        slots[index].cleanup = effect() || undefined;
      });
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.());
    }
  };
});

vi.mock("react", () => host);
vi.mock("react-native", () => ({
  Animated: {
    Value: class {
      value: number;
      stop?: () => void;
      constructor(value: number) {
        this.value = value;
      }
      setValue(value: number) {
        this.value = value;
      }
      stopAnimation() {
        this.stop?.();
      }
    },
    timing(
      value: { setValue: (value: number) => void; stop?: () => void },
      config: { duration: number; toValue: number }
    ) {
      let timer: ReturnType<typeof setTimeout>;
      return {
        start(callback: (result: { finished: boolean }) => void) {
          value.stop = () => {
            clearTimeout(timer);
            callback({ finished: false });
          };
          timer = setTimeout(() => {
            value.setValue(config.toValue);
            callback({ finished: true });
          }, config.duration);
        },
        stop() {
          value.stop?.();
        }
      };
    }
  }
}));

import { useInitialReveal } from "../src/ui/useInitialReveal";

afterEach(() => {
  host.unmount();
  host.reset();
  vi.useRealTimers();
});

describe("initial loading reveal", () => {
  it("restarts a fade when the customization item changes mid-animation", () => {
    vi.useFakeTimers();
    host.render(() => useInitialReveal(false, { resetKey: "first-item" }));
    vi.advanceTimersByTime(100);
    host.render(() => useInitialReveal(false, { resetKey: "second-item" }));
    vi.advanceTimersByTime(260);
    expect(host.render(() => useInitialReveal(false, { resetKey: "second-item" })).showLoadingOverlay).toBe(false);
  });

  it("waits for initial data but leaves subsequent refreshes visible", () => {
    vi.useFakeTimers();
    expect(host.render(() => useInitialReveal(true)).showLoadingOverlay).toBe(true);
    host.render(() => useInitialReveal(false));
    vi.advanceTimersByTime(260);
    expect(host.render(() => useInitialReveal(false)).showLoadingOverlay).toBe(false);
    expect(host.render(() => useInitialReveal(true)).showLoadingOverlay).toBe(false);
  });

  it("skips the overlay when a customization item is unavailable", () => {
    expect(
      host.render(() =>
        useInitialReveal(false, {
          resetKey: "missing-item",
          skipAnimation: true
        })
      ).showLoadingOverlay
    ).toBe(false);
  });

  it("waits for the next item's hero after an earlier reveal has completed", () => {
    vi.useFakeTimers();
    host.render(() => useInitialReveal(false, { resetKey: "first-item" }));
    vi.advanceTimersByTime(260);
    expect(host.render(() => useInitialReveal(false, { resetKey: "first-item" })).showLoadingOverlay).toBe(false);
    expect(host.render(() => useInitialReveal(true, { resetKey: "next-item" })).showLoadingOverlay).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(host.render(() => useInitialReveal(true, { resetKey: "next-item" })).showLoadingOverlay).toBe(true);
    host.render(() => useInitialReveal(false, { resetKey: "next-item" }));
    vi.advanceTimersByTime(260);
    expect(host.render(() => useInitialReveal(false, { resetKey: "next-item" })).showLoadingOverlay).toBe(false);
  });

  it("cancels an in-progress fade on unmount", () => {
    vi.useFakeTimers();
    host.render(() => useInitialReveal(false));
    expect(vi.getTimerCount()).toBe(1);
    host.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
