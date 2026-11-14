import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeDiscountCodeField } from "../src/cart/NativeDiscountCodeField";

const runtime = vi.hoisted(() => ({ refs: [] as { current: unknown }[], index: 0, setText: vi.fn() }));
vi.stubGlobal("React", React);
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useRef: (initial: unknown) => {
    const index = runtime.index++;
    return runtime.refs[index] ?? (runtime.refs[index] = { current: index === 0 ? { setText: runtime.setText } : initial });
  },
  useEffect: (effect: () => void) => effect()
}));
vi.mock("@expo/ui/swift-ui", () => Object.fromEntries(["Button", "Form", "HStack", "Host", "Section", "Text", "TextField"].map((name) => [name, `Native${name}`])));
vi.mock("@expo/ui/swift-ui/modifiers", () => Object.fromEntries(
  ["accessibilityLabel", "autocorrectionDisabled", "buttonStyle", "disabled", "dynamicTypeSize", "foregroundStyle", "keyboardType", "listSectionMargins", "scrollContentBackground", "scrollDisabled", "textInputAutocapitalization"]
    .map((name) => [name, (value: unknown) => ({ name, value })])
));
vi.mock("../src/ui/system", () => ({ uiPalette: { danger: "red", primary: "forest" } }));

function render(overrides: Partial<Parameters<typeof NativeDiscountCodeField>[0]> = {}) {
  runtime.index = 0;
  const props = { value: "SAVE10", onChange: vi.fn(), onApply: vi.fn(), applying: false, applied: false, ...overrides };
  const host = NativeDiscountCodeField(props);
  const form = host.props.children;
  const section = form.props.children;
  const [field, button] = section.props.children.props.children;
  return { props, host, form, section, field, button };
}

beforeEach(() => { vi.clearAllMocks(); runtime.refs = []; });

describe("native discount Apply row", () => {
  it("uses a native Form row with a separate Apply button and no permanent helper text", () => {
    const { props, form, section, button } = render();
    expect(form.type).toBe("NativeForm"); expect(button.type).toBe("NativeButton");
    expect(button.props.label).toBe("Apply"); expect(section.props.footer).toBeUndefined();
    button.props.onPress(); expect(props.onApply).toHaveBeenCalledOnce();
  });
  it("disables duplicate submission and editing while checking a code", () => {
    const { field, button } = render({ applying: true });
    expect(button.props.label).toBe("Checking…");
    expect(button.props.modifiers).toContainEqual({ name: "disabled", value: true });
    expect(field.props.modifiers).toContainEqual({ name: "disabled", value: true });
  });
  it("shows Applied after success and keeps errors within the native section footer", () => {
    expect(render({ applied: true }).button.props.label).toBe("Applied");
    const { section } = render({ error: "This code has expired." });
    expect(section.props.footer.props.children).toBe("This code has expired.");
  });
  it("keeps field edits in the existing cart and synchronizes external code removal", () => {
    const { field, props } = render();
    field.props.onTextChange("NEWCODE"); expect(props.onChange).toHaveBeenCalledWith("NEWCODE");
    render({ value: "" }); expect(runtime.setText).toHaveBeenLastCalledWith("");
  });
});
