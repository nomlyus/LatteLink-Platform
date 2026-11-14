import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = ts.createSourceFile(
  "MenuScreen.tsx",
  readFileSync(new URL("../src/screens/MenuScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);

function elements(tag: string) {
  const matches: ts.JsxElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === tag) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return matches;
}

describe("Menu native scroll discovery", () => {
  it("places the scroll view first in its screen without requiring an experimental native marker", () => {
    const scrollView = elements("ScrollView")[0];
    const parent = scrollView.parent;
    if (!ts.isJsxElement(parent)) throw new Error("Scroll view must be a direct screen child");
    const children = parent.children.filter((node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node));
    expect(children[0]).toBe(scrollView);
    expect(parent.openingElement.tagName.getText(source)).toBe("View");
    const preserveHierarchy = parent.openingElement.attributes.properties
      .filter(ts.isJsxAttribute)
      .find((attribute) => attribute.name.getText(source) === "collapsable");
    expect(preserveHierarchy?.initializer?.getText(source)).toBe("{false}");
    expect(source.text).not.toContain("ScrollViewMarker");
  });

  it("uses native inset/collapse behavior while retaining refresh and one content scroll view", () => {
    const scrollViews = elements("ScrollView");
    expect(scrollViews).toHaveLength(1);
    const attributes = scrollViews[0].openingElement.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.getText(source));
    expect(attributes).toEqual(
      expect.arrayContaining([
        "refreshControl",
        "contentContainerStyle",
        "contentInsetAdjustmentBehavior"
      ])
    );
    expect(source.text).toContain('contentInsetAdjustmentBehavior={nativeScrollingHeader ? "automatic" : "never"}');
    expect(source.text).toContain("paddingTop: nativeScrollingHeader ? 12 : nativeHeaderHeight + 12");
    expect(source.text).toContain("onLayout={registerScrollEdge}");
    expect(source.text).not.toContain("snapHeader");
    expect(source.text).not.toContain("MENU_HEADER_");
  });

  it("removes the custom header and preserves the existing screen background", () => {
    const scrollView = elements("ScrollView")[0];
    expect(scrollView.getText(source)).not.toContain("styles.headerShell");
    expect(source.text).not.toContain("styles.headerShell");
    expect(source.text).toMatch(/screen:\s*\{\s*flex: 1,\s*backgroundColor: uiPalette\.background/);
  });
});
