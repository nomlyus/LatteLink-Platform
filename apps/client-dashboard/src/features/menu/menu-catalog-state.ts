import type { OperatorMenuResponse } from "../../model";

export type MenuCatalogState = {
  scopeKey: string;
  status: "loading" | "ready" | "error";
  menu: OperatorMenuResponse | null;
  error: string | null;
};

// Same-scope mutation refreshes must not unmount open editors. Never retain
// another operator/location's catalog, or claim failed refreshes are current.
export function startMenuLoad(previous: MenuCatalogState, scopeKey: string, preserveMenu: boolean): MenuCatalogState {
  const menu = preserveMenu && previous.scopeKey === scopeKey ? previous.menu : null;
  return { scopeKey, status: menu ? "ready" : "loading", menu, error: null };
}

export function failMenuLoad(previous: MenuCatalogState, scopeKey: string, preserveMenu: boolean, error: string): MenuCatalogState {
  return { ...startMenuLoad(previous, scopeKey, preserveMenu), status: "error", error };
}
