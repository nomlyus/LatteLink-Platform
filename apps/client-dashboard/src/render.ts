import { renderAuthScreen } from "./views/auth";
import { renderDashboard } from "./views/layout";
import { renderOrdersSection } from "./views/orders";
import { renderToasts } from "./views/toasts";
import { state } from "./state";
import { setToastRenderHandler } from "./toast-runtime";

export let root = {} as HTMLDivElement;
let activeRoot: HTMLDivElement | null = null;

export function bindDashboardRoot(nextRoot: HTMLDivElement | null) {
  if (nextRoot) {
    root = nextRoot;
    activeRoot = nextRoot;
    setToastRenderHandler(render);
  } else {
    activeRoot = null;
  }
}

export function renderOrdersSectionOnly() {
  if (!activeRoot) return;
  const currentSection = root.querySelector<HTMLElement>(".dash-section--orders");
  if (!currentSection) return;

  const focusedRefreshButton = currentSection.querySelector('[data-action="refresh"]') === document.activeElement;
  const tableScrollLeft = currentSection.querySelector<HTMLElement>(".dash-order-table-wrap")?.scrollLeft ?? 0;
  const template = document.createElement("template");
  template.innerHTML = renderOrdersSection().trim();
  const nextSection = template.content.querySelector<HTMLElement>(".dash-section--orders");
  if (!nextSection) return;

  currentSection.replaceWith(nextSection);
  const nextTable = nextSection.querySelector<HTMLElement>(".dash-order-table-wrap");
  if (nextTable) nextTable.scrollLeft = tableScrollLeft;
  if (focusedRefreshButton) {
    nextSection.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.focus({ preventScroll: true });
  }
}

function captureMenuTableImages() {
  const images = new Map<string, { element: HTMLImageElement; src: string }>();
  root.querySelectorAll<HTMLImageElement>(".dash-order-table--menu img.dash-menu-table__image[data-item-id]").forEach((image) => {
    const itemId = image.dataset.itemId;
    const src = image.getAttribute("src");
    if (itemId && src) {
      images.set(itemId, { element: image, src });
    }
  });
  return images;
}

function restoreMenuTableImages(images: Map<string, { element: HTMLImageElement; src: string }>) {
  root.querySelectorAll<HTMLImageElement>(".dash-order-table--menu img.dash-menu-table__image[data-item-id]").forEach((nextImage) => {
    const itemId = nextImage.dataset.itemId;
    const previous = itemId ? images.get(itemId) : undefined;
    if (previous && previous.src === nextImage.getAttribute("src")) {
      nextImage.replaceWith(previous.element);
    }
  });
}

export function render() {
  if (!activeRoot) return;
  const previousMenuImages = captureMenuTableImages();
  const previousSidebar = root.querySelector<HTMLElement>(".dash-sidebar");
  const previousSidebarClass = previousSidebar?.className ?? null;
  const previousSection = previousSidebar?.querySelector<HTMLElement>(".dash-nav-item--active")?.dataset.section ?? null;
  const previousTopbar = root.querySelector<HTMLElement>(".dash-topbar");
  const previousGlobalSearch = root.querySelector<HTMLElement>(".dash-global-search");
  const previousNotificationButton = root.querySelector<HTMLElement>(".dash-notification-button");
  const prevRail = root.querySelector<HTMLElement>(".dash-store-summary__rail");
  const prevIndex = prevRail?.style.getPropertyValue("--store-summary-active-index").trim() ?? null;

  root.innerHTML = (state.session ? renderDashboard() : renderAuthScreen()) + renderToasts();
  restoreMenuTableImages(previousMenuImages);

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
