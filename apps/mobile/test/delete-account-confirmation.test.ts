import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteAccountSheet } from "../src/account/DeleteAccountSheet";

const runtime = vi.hoisted(() => ({ refs: [] as { current: unknown }[], index: 0, effects: [] as (() => void | (() => void))[], alert: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof React>(),
  useRef: (value: unknown) => { const i = runtime.index++; return runtime.refs[i] ?? (runtime.refs[i] = { current: value }); },
  useEffect: (effect: () => void | (() => void)) => runtime.effects.push(effect)
}));
vi.mock("react-native", () => ({ Alert: { alert: runtime.alert } }));
const callbacks = { onClose: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() };
function render(open: boolean, pending = false) {
  runtime.index = 0;
  DeleteAccountSheet({ open, pending, bottomInset: 0, ...callbacks });
  return runtime.effects.splice(0).map((effect) => effect());
}
describe("native account deletion confirmation", () => {
  beforeEach(() => { runtime.refs = []; runtime.index = 0; runtime.effects = []; vi.clearAllMocks(); });
  it("requires a destructive native confirmation and guards duplicate submission", () => {
    render(true);
    const [, , buttons] = runtime.alert.mock.calls[0];
    expect(buttons[0].style).toBe("cancel");
    expect(buttons[1].style).toBe("destructive");
    expect(callbacks.onConfirm).not.toHaveBeenCalled();
    buttons[1].onPress(); buttons[1].onPress();
    expect(callbacks.onConfirm).toHaveBeenCalledOnce();
    render(true, true);
    expect(runtime.alert).toHaveBeenCalledOnce();
  });
  it("does not perform the operation on cancellation or after disposal", () => {
    const cleanups = render(true);
    const buttons = runtime.alert.mock.calls[0][2];
    buttons[0].onPress();
    expect(callbacks.onCancel).toHaveBeenCalledOnce();
    for (const cleanup of cleanups) cleanup?.();
    buttons[1].onPress();
    expect(callbacks.onConfirm).not.toHaveBeenCalled();
  });
  it("does not present a second alert until the prior open state has closed", () => {
    render(false); expect(runtime.alert).not.toHaveBeenCalled();
    render(true); render(true);
    expect(runtime.alert).toHaveBeenCalledOnce();
    render(false); render(true);
    expect(runtime.alert).toHaveBeenCalledTimes(2);
  });
});
