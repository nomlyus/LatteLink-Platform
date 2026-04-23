import { renderAuthScreen } from "./views/auth.js";
import { renderDashboard } from "./views/layout.js";
import { renderToasts } from "./views/toasts.js";
import { state } from "./state.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Client dashboard root element was not found.");
}

export const root: HTMLDivElement = appRoot;

export function render() {
  root.innerHTML = (state.session ? renderDashboard() : renderAuthScreen()) + renderToasts();
}
