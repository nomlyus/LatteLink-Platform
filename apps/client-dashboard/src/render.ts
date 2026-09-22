import { renderAuthScreen } from "./views/auth";
import { renderDashboard } from "./views/layout";
import { renderToasts } from "./views/toasts";
import { state } from "./state";
import { setToastRenderHandler } from "./toast-runtime";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Client dashboard root element was not found.");
}

export const root: HTMLDivElement = appRoot;

export function render() {
  const previousSidebar = root.querySelector<HTMLElement>(".dash-sidebar");
  const previousSidebarClass = previousSidebar?.className ?? null;
  const previousSection = previousSidebar?.querySelector<HTMLElement>(".dash-nav-item--active")?.dataset.section ?? null;
  const previousTopbar = root.querySelector<HTMLElement>(".dash-topbar");
  const previousGlobalSearch = root.querySelector<HTMLElement>(".dash-global-search");
  const previousNotificationButton = root.querySelector<HTMLElement>(".dash-notification-button");
  const prevRail = root.querySelector<HTMLElement>(".dash-store-summary__rail");
  const prevIndex = prevRail?.style.getPropertyValue("--store-summary-active-index").trim() ?? null;

  root.innerHTML = (state.session ? renderDashboard() : renderAuthScreen()) + renderToasts();

  const nextSidebar = root.querySelector<HTMLElement>(".dash-sidebar");
  const nextTopbar = root.querySelector<HTMLElement>(".dash-topbar");
  const sidebarLoadedFromLoading =
    previousSidebar?.classList.contains("dash-sidebar--loading") === true &&
    nextSidebar &&
    !nextSidebar.classList.contains("dash-sidebar--loading");

  if (sidebarLoadedFromLoading) {
    nextSidebar.classList.add("dash-sidebar--loading-complete");
  }

  const canPreserveSidebar =
    previousSidebar &&
    nextSidebar &&
    previousSidebarClass === nextSidebar.className &&
    !nextSidebar.classList.contains("dash-sidebar--loading");

  if (canPreserveSidebar) {
    nextSidebar.replaceWith(previousSidebar);
    previousSidebar.querySelectorAll<HTMLElement>(".dash-nav-item").forEach((item) => {
      item.classList.toggle("dash-nav-item--active", item.dataset.section === state.section);
      const nextItem = nextSidebar.querySelector<HTMLElement>(
        `.dash-nav-item[data-section="${item.dataset.section}"]`
      );
      const currentBadge = item.querySelector<HTMLElement>(".dash-nav-badge");
      const nextBadge = nextItem?.querySelector<HTMLElement>(".dash-nav-badge");
      if (currentBadge && nextBadge) {
        currentBadge.textContent = nextBadge.textContent;
      } else if (currentBadge) {
        currentBadge.remove();
      } else if (nextBadge) {
        item.appendChild(nextBadge.cloneNode(true));
      }
    });
  }

  const canPreserveTopbar =
    previousTopbar &&
    nextTopbar &&
    previousSection &&
    previousSection !== state.section &&
    !nextSidebar?.classList.contains("dash-sidebar--loading");

  if (canPreserveTopbar) {
    const nextPageStack = nextTopbar.querySelector<HTMLElement>(".dash-page-stack");
    const previousTitle = previousTopbar.querySelector<HTMLElement>(".dash-page-title");
    const previousPageStack = previousTopbar.querySelector<HTMLElement>(".dash-page-stack");
    if (nextPageStack && previousPageStack) {
      previousPageStack.replaceWith(nextPageStack);
    } else if (previousTitle) {
      previousTitle.textContent = nextTopbar.querySelector<HTMLElement>(".dash-page-title")?.textContent ?? "";
    }
    nextTopbar.replaceWith(previousTopbar);
  }

  const nextGlobalSearch = root.querySelector<HTMLElement>(".dash-global-search");
  if (previousGlobalSearch && nextGlobalSearch && previousGlobalSearch !== nextGlobalSearch) {
    nextGlobalSearch.replaceWith(previousGlobalSearch);
  }

  const nextNotificationButton = root.querySelector<HTMLElement>(".dash-notification-button");
  if (previousNotificationButton && nextNotificationButton && previousNotificationButton !== nextNotificationButton) {
    nextNotificationButton.replaceWith(previousNotificationButton);
  }

  if (prevIndex !== null) {
    const nextRail = root.querySelector<HTMLElement>(".dash-store-summary__rail");
    if (nextRail) {
      const nextIndex = nextRail.style.getPropertyValue("--store-summary-active-index").trim();
      if (prevIndex !== nextIndex) {
        nextRail.style.setProperty("--store-summary-active-index", prevIndex);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            nextRail.style.setProperty("--store-summary-active-index", nextIndex);
          });
        });
      }
    }
  }
}

setToastRenderHandler(render);
