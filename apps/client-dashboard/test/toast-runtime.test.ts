import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../src/state";
import {
  addToast,
  dismissToast,
  resetToastRuntime,
  setToastRenderHandler,
  toastFadeDurationMs,
  toastVisibleDurationMs
} from "../src/toast-runtime";

describe("toast runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.toasts = [];
  });

  afterEach(() => {
    resetToastRuntime();
    vi.useRealTimers();
  });

  it("fades after ten seconds and then removes the toast", () => {
    const render = vi.fn();
    setToastRenderHandler(render);
    addToast("Saved.", "success");

    vi.advanceTimersByTime(toastVisibleDurationMs - 1);
    expect(state.toasts).toEqual([expect.objectContaining({ dismissing: false })]);

    vi.advanceTimersByTime(1);
    expect(state.toasts).toEqual([expect.objectContaining({ dismissing: true })]);
    expect(render).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(toastFadeDurationMs);
    expect(state.toasts).toEqual([]);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("clears automatic dismissal when dismissed manually", () => {
    const render = vi.fn();
    setToastRenderHandler(render);
    const id = addToast("Saved.", "success");

    dismissToast(id);
    vi.runAllTimers();

    expect(state.toasts).toEqual([]);
    expect(render).not.toHaveBeenCalled();
  });
});
