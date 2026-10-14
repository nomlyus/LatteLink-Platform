import { describe, expect, it } from "vitest";
import { failMenuLoad, startMenuLoad, type MenuCatalogState } from "../src/features/menu/menu-catalog-state";

const menu = { locationId: "location-a", categories: [], modifierGroups: [] };
const loaded: MenuCatalogState = { scopeKey: "owner:location-a", status: "ready", menu, error: null };

describe("Menu mutation refresh continuity", () => {
  it("retains the same catalog object during a same-scope reload instead of hiding editors behind a skeleton", () => {
    const refreshing = startMenuLoad(loaded, loaded.scopeKey, true);
    expect(refreshing.status).toBe("ready");
    expect(refreshing.menu).toBe(menu);
    expect(refreshing.error).toBeNull();
  });

  it("keeps editor data available on refresh failure while explicitly reporting the failure", () => {
    const failed = failMenuLoad(loaded, loaded.scopeKey, true, "Unable to refresh menu");
    expect(failed.status).toBe("error");
    expect(failed.error).toBe("Unable to refresh menu");
    expect(failed.menu).toBe(menu);
    const retrying = startMenuLoad(failed, loaded.scopeKey, true);
    expect(retrying.menu).toBe(menu);
    expect(retrying.error).toBeNull();
  });

  it("never retains a catalog after operator or location scope changes", () => {
    for (const scopeKey of ["owner:location-b", "another-operator:location-a"]) {
      expect(startMenuLoad(loaded, scopeKey, true)).toMatchObject({ scopeKey, status: "loading", menu: null });
      expect(failMenuLoad(loaded, scopeKey, true, "Failed").menu).toBeNull();
    }
  });

  it("preserves initial-load and explicit scope revalidation loading behavior", () => {
    expect(startMenuLoad(loaded, loaded.scopeKey, false)).toMatchObject({ status: "loading", menu: null });
    expect(startMenuLoad({ ...loaded, menu: null }, loaded.scopeKey, true)).toMatchObject({ status: "loading", menu: null });
  });
});
