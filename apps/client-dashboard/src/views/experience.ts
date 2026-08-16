import type { MobileExperienceDocument, MobileExperienceSection } from "@lattelink/contracts-catalog";
import { canUpdateStoreSettings } from "../model.js";
import { isAllLocationsSelected, state } from "../state.js";
import { escapeHtml } from "../ui/format.js";
import { renderLocationSelectionNotice, renderSectionHeading } from "./common.js";

const templateLabels: Record<MobileExperienceDocument["templateId"], string> = {
  coffee_standard: "Coffee standard",
  editorial_featured: "Editorial featured",
  compact_ordering: "Compact ordering"
};

const sectionLabels: Record<MobileExperienceSection["type"], string> = {
  hero: "Hero",
  quick_actions: "Quick actions",
  featured_menu: "Featured menu",
  news_cards: "News cards"
};

const actionLabels = {
  open_menu: "Menu",
  open_orders: "Orders",
  open_account: "Account"
} as const;

function getDraft() {
  return state.mobileExperience?.draft ?? null;
}

function getHomeSections(draft: MobileExperienceDocument) {
  return draft.screens.find((screen) => screen.id === "home")?.sections ?? [];
}

function getSection<TType extends MobileExperienceSection["type"]>(
  sections: MobileExperienceSection[],
  type: TType
) {
  return sections.find((section): section is Extract<MobileExperienceSection, { type: TType }> => section.type === type);
}

function renderTemplateOptions(draft: MobileExperienceDocument) {
  return (Object.keys(templateLabels) as MobileExperienceDocument["templateId"][])
    .map(
      (templateId) => `
        <option value="${templateId}" ${draft.templateId === templateId ? "selected" : ""}>
          ${escapeHtml(templateLabels[templateId])}
        </option>
      `
    )
    .join("");
}

function renderActionOptions(selected: string | undefined) {
  return (Object.keys(actionLabels) as Array<keyof typeof actionLabels>)
    .map(
      (action) => `<option value="${action}" ${selected === action ? "selected" : ""}>${escapeHtml(actionLabels[action])}</option>`
    )
    .join("");
}

function renderCategoryOptions(selected: string | undefined) {
  return [
    `<option value="" ${selected ? "" : "selected"}>All visible items</option>`,
    ...state.menuCategories.map(
      (category) => `
        <option value="${escapeHtml(category.categoryId)}" ${selected === category.categoryId ? "selected" : ""}>
          ${escapeHtml(category.title)}
        </option>
      `
    )
  ].join("");
}

function renderQuickActionToggle(action: keyof typeof actionLabels, selectedActions: readonly string[]) {
  return `
    <label class="experience-chip-toggle">
      <input type="checkbox" name="quickAction:${action}" ${selectedActions.includes(action) ? "checked" : ""} />
      <span>${escapeHtml(actionLabels[action])}</span>
    </label>
  `;
}

function renderSectionEditorCards(sections: MobileExperienceSection[]) {
  return sections
    .map((section, index) => {
      const isRequired = section.type === "hero";
      const selectedQuickActions = section.type === "quick_actions"
        ? section.actions ?? ["open_menu", "open_orders", "open_account"]
        : [];
      const settings =
        section.type === "hero"
          ? `
            <label class="field">
              <span>Button destination</span>
              <select name="heroAction">${renderActionOptions(section.action ?? "open_menu")}</select>
            </label>
          `
          : section.type === "quick_actions"
            ? `
              <div class="experience-chip-row" aria-label="Quick action buttons">
                ${renderQuickActionToggle("open_menu", selectedQuickActions)}
                ${renderQuickActionToggle("open_orders", selectedQuickActions)}
                ${renderQuickActionToggle("open_account", selectedQuickActions)}
              </div>
            `
            : section.type === "featured_menu"
              ? `
                <label class="field">
                  <span>Content source</span>
                  <select name="featuredMenuCategoryId">${renderCategoryOptions(section.categoryId)}</select>
                </label>
              `
              : "";

      return `
        <article class="experience-section-card ${section.visible ? "" : "experience-section-card--disabled"}">
          <input type="hidden" name="sectionOrder:${section.type}" value="${index + 1}" />
          <div class="experience-section-card__head">
            <label class="experience-section-card__toggle">
              <input type="checkbox" name="sectionVisible:${section.type}" ${section.visible ? "checked" : ""} ${isRequired ? "disabled checked" : ""} />
              <span>${escapeHtml(isRequired ? "Required" : section.visible ? "Included" : "Removed")}</span>
            </label>
            <div>
              <strong>${escapeHtml(sectionLabels[section.type])}</strong>
              <p>${escapeHtml(section.visible ? "Shown in the customer home layout." : "Available to add back before publishing.")}</p>
            </div>
            <div class="experience-section-card__order" aria-label="${escapeHtml(sectionLabels[section.type])} order controls">
              <button class="button button--ghost button--sm" type="button" data-action="move-mobile-experience-section" data-section-type="${section.type}" data-direction="up" ${index === 0 ? "disabled" : ""}>Up</button>
              <button class="button button--ghost button--sm" type="button" data-action="move-mobile-experience-section" data-section-type="${section.type}" data-direction="down" ${index === sections.length - 1 ? "disabled" : ""}>Down</button>
            </div>
          </div>
          ${settings ? `<div class="experience-section-card__settings">${settings}</div>` : ""}
        </article>
      `;
    })
    .join("");
}

function countVisibleSections(sections: MobileExperienceSection[]) {
  return sections.filter((section) => section.visible).length;
}

function compareDraftToPublished(draft: MobileExperienceDocument, published: MobileExperienceDocument | undefined) {
  if (!published) {
    return "No published version yet";
  }

  const draftSections = getHomeSections(draft).filter((section) => section.visible).map((section) => section.type).join(", ");
  const publishedSections = getHomeSections(published).filter((section) => section.visible).map((section) => section.type).join(", ");
  if (draft.templateId !== published.templateId) {
    return "Template changed";
  }
  if (draftSections !== publishedSections) {
    return "Layout changed";
  }
  return "No layout changes";
}

function renderVersionHistory(canWrite: boolean) {
  const versions = state.mobileExperienceVersions.versions;
  if (versions.length === 0) {
    return "";
  }

  return `
    <div class="experience-version-history">
      <div class="dash-panel-title">Published versions</div>
      ${versions
        .slice(0, 5)
        .map((version) => {
          const restoring = state.rollingBackMobileExperienceVersionId === version.versionId;
          const label = version.publishedAt ? new Date(version.publishedAt).toLocaleString() : version.versionId;
          return `
            <div class="experience-version-row">
              <span>${escapeHtml(label)}</span>
              <span>${escapeHtml(templateLabels[version.templateId])}</span>
              <small>${getHomeSections(version).filter((section) => section.visible).map((section) => sectionLabels[section.type]).join(" / ")}</small>
              <button
                class="button button--ghost"
                type="button"
                data-action="rollback-mobile-experience"
                data-version-id="${escapeHtml(version.versionId)}"
                ${!canWrite || restoring ? "disabled" : ""}
              >
                ${restoring ? "Restoring..." : "Restore"}
              </button>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPreviewSection(section: MobileExperienceSection) {
  if (!section.visible) {
    return "";
  }

  if (section.type === "hero") {
    return `
      <div class="experience-phone-hero">
        <span>Featured</span>
        <strong>${escapeHtml(section.title ?? state.storeConfig?.storeName ?? "Store")}</strong>
        <p>${escapeHtml(section.subtitle ?? state.storeConfig?.locationName ?? "Location")}</p>
        <button type="button">${escapeHtml(section.actionLabel ?? "Order now")}</button>
      </div>
    `;
  }

  if (section.type === "quick_actions") {
    const actions = section.actions ?? ["open_menu", "open_orders", "open_account"];
    return `
      <div class="experience-phone-actions">
        ${actions.map((action) => `<span>${escapeHtml(actionLabels[action])}</span>`).join("")}
      </div>
    `;
  }

  if (section.type === "featured_menu") {
    const sourceItems = section.categoryId
      ? state.menuCategories.find((category) => category.categoryId === section.categoryId)?.items ?? []
      : state.menuCategories.flatMap((category) => category.items);
    const items = sourceItems.slice(0, section.itemLimit ?? 4);
    return `
      <div class="experience-phone-block">
        <strong>${escapeHtml(section.title ?? "Popular today")}</strong>
        ${items.map((item) => `<p>${escapeHtml(item.name)}</p>`).join("") || "<p>No menu items yet</p>"}
      </div>
    `;
  }

  return `
    <div class="experience-phone-block">
      <strong>${escapeHtml(section.title ?? "Latest")}</strong>
      ${state.newsCards.slice(0, section.cardLimit ?? 4).map((card) => `<p>${escapeHtml(card.title)}</p>`).join("") || "<p>No cards yet</p>"}
    </div>
  `;
}

export function renderExperienceSection() {
  if (isAllLocationsSelected()) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "App builder",
          title: "Choose a location",
          description: "Mobile app experiences are drafted and published one location at a time."
        })}
        ${renderLocationSelectionNotice("Pick a specific location from the workspace selector to edit and publish its app experience.")}
      </section>
    `;
  }

  const draft = getDraft();
  if (!draft) {
    return `
      <section class="dash-section">
        ${renderSectionHeading({
          eyebrow: "App builder",
          title: "Mobile experience",
          description: "Loading the app experience draft."
        })}
        <article class="dash-surface dash-empty-surface"><p class="muted-copy">Loading app builder…</p></article>
      </section>
    `;
  }

  const sections = getHomeSections(draft);
  const hero = getSection(sections, "hero");
  const featuredMenu = getSection(sections, "featured_menu");
  const newsCards = getSection(sections, "news_cards");
  const canWrite = canUpdateStoreSettings(state.session?.operator ?? null);
  const publishedLabel = state.mobileExperience?.published?.publishedAt
    ? `Published ${new Date(state.mobileExperience.published.publishedAt).toLocaleString()}`
    : "Not published yet";
  const visibleSectionCount = countVisibleSections(sections);
  const compareLabel = compareDraftToPublished(draft, state.mobileExperience?.published);

  return `
    <section class="dash-section">
      ${renderSectionHeading({
        eyebrow: "App builder",
        title: "Mobile experience",
        description: "Choose a base template, arrange approved sections, preview the customer home screen, and publish a versioned experience."
      })}
      <div class="experience-layout">
        <article class="dash-surface experience-editor">
          <div class="dash-surface-head">
            <div>
              <div class="dash-panel-title">Draft</div>
              <h3 class="dash-surface-title">${escapeHtml(templateLabels[draft.templateId])}</h3>
            </div>
            <span class="dash-status-badge dash-status-badge--neutral">${escapeHtml(publishedLabel)}</span>
          </div>
          <div class="experience-builder-summary">
            <div><span>Visible sections</span><strong>${visibleSectionCount}</strong></div>
            <div><span>Draft status</span><strong>${escapeHtml(compareLabel)}</strong></div>
            <div><span>Protected tabs</span><strong>Home / Menu / Orders / Account</strong></div>
          </div>
          ${
            canWrite
              ? `
                <form class="experience-form" data-form="mobile-experience">
                  <label class="field">
                    <span>Base template</span>
                    <select name="templateId">${renderTemplateOptions(draft)}</select>
                  </label>
                  <label class="field">
                    <span>Accent color</span>
                    <input name="accentColor" value="${escapeHtml(draft.theme.accentColor ?? "")}" placeholder="#2f6b4f" />
                  </label>
                  <label class="field">
                    <span>Background color</span>
                    <input name="backgroundColor" value="${escapeHtml(draft.theme.backgroundColor ?? "")}" placeholder="#f6f2ec" />
                  </label>
                  <label class="field">
                    <span>Text color</span>
                    <input name="foregroundColor" value="${escapeHtml(draft.theme.foregroundColor ?? "")}" placeholder="#161a18" />
                  </label>
                  <div class="experience-section-controls">
                    ${renderSectionEditorCards(sections)}
                  </div>
                  <label class="field">
                    <span>Hero title</span>
                    <input name="heroTitle" value="${escapeHtml(hero?.title ?? state.storeConfig?.storeName ?? "")}" required />
                  </label>
                  <label class="field">
                    <span>Hero subtitle</span>
                    <input name="heroSubtitle" value="${escapeHtml(hero?.subtitle ?? state.storeConfig?.locationName ?? "")}" required />
                  </label>
                  <label class="field">
                    <span>Hero button</span>
                    <input name="heroActionLabel" value="${escapeHtml(hero?.actionLabel ?? "Order now")}" required />
                  </label>
                  <label class="field">
                    <span>Featured menu title</span>
                    <input name="featuredMenuTitle" value="${escapeHtml(featuredMenu?.title ?? "Popular today")}" />
                  </label>
                  <label class="field">
                    <span>Featured item limit</span>
                    <input name="featuredMenuLimit" type="number" min="1" max="8" value="${featuredMenu?.itemLimit ?? 4}" />
                  </label>
                  <label class="field">
                    <span>News title</span>
                    <input name="newsCardsTitle" value="${escapeHtml(newsCards?.title ?? "Latest")}" />
                  </label>
                  <label class="field">
                    <span>News card limit</span>
                    <input name="newsCardsLimit" type="number" min="1" max="8" value="${newsCards?.cardLimit ?? 4}" />
                  </label>
                  <div class="dash-form-actions">
                    <button class="button button--primary" type="submit" ${state.savingMobileExperience ? "disabled" : ""}>
                      ${state.savingMobileExperience ? '<span class="spinner"></span>' : "Save draft"}
                    </button>
                    <button class="button button--secondary" type="button" data-action="publish-mobile-experience" ${state.publishingMobileExperience ? "disabled" : ""}>
                      ${state.publishingMobileExperience ? '<span class="spinner"></span>' : "Publish"}
                    </button>
                  </div>
                </form>
                ${renderVersionHistory(canWrite)}
              `
              : `<p class="muted-copy">App experience editing is read-only for your current role.</p>`
          }
        </article>

        <aside class="experience-phone-shell" aria-label="Mobile app preview">
          <div class="experience-phone">
            <div class="experience-phone-top">
              <strong>${escapeHtml(hero?.title ?? state.storeConfig?.storeName ?? "Store")}</strong>
              <span>${escapeHtml(hero?.subtitle ?? state.storeConfig?.locationName ?? "Location")}</span>
            </div>
            <div class="experience-phone-body">
              ${sections.map(renderPreviewSection).join("")}
            </div>
            <div class="experience-phone-tabs">
              <span>Home</span><span>Menu</span><span>Orders</span><span>Account</span>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}
