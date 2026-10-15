import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const mobileRoot = join(import.meta.dirname, "..");
const sourceRoots = [join(mobileRoot, "app"), join(mobileRoot, "src")];
const lockedTextComponents = new Set(["Text", "TextInput", "Animated.Text"]);

function listTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTsxFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

function getTagName(node: ts.JsxOpeningLikeElement) {
  return node.tagName.getText();
}

describe("font scaling defaults", () => {
  it("does not disable system text scaling", () => {
    const violations: string[] = [];

    for (const filePath of sourceRoots.flatMap(listTsxFiles)) {
      const source = ts.createSourceFile(
        filePath,
        readFileSync(filePath, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagName = getTagName(node);
          if (lockedTextComponents.has(tagName)) {
            const allowFontScaling = node.attributes.properties.find(
              (attribute): attribute is ts.JsxAttribute =>
                ts.isJsxAttribute(attribute) && attribute.name.getText() === "allowFontScaling"
            );
            const maxFontSizeMultiplier = node.attributes.properties.find(
              (attribute): attribute is ts.JsxAttribute =>
                ts.isJsxAttribute(attribute) && attribute.name.getText() === "maxFontSizeMultiplier"
            );
            const disablesScaling =
              allowFontScaling?.initializer?.getText() === "{false}" ||
              maxFontSizeMultiplier?.initializer?.getText() === "{1}";

            if (disablesScaling) {
              const position = source.getLineAndCharacterOfPosition(node.getStart(source));
              violations.push(`${filePath}:${position.line + 1} ${tagName}`);
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }

    expect(violations).toEqual([]);
  });
});
