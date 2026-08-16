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

function renderSectionOrderOptions(currentIndex: number) {
  return [0, 1, 2, 3]
    .map(
      (index) => `<option value="${index + 1}" ${index === currentIndex ? "selected" : ""}>${index + 1}</option>`
    )
    .join("");
}

function renderSectionToggles(sections: MobileExperienceSection[]) {
  return sections
    .map(
      (section) => `
        <label class="experience-section-toggle">
          <input type="checkbox" name="sectionVisible:${section.type}" ${section.visible ? "checked" : ""} ${section.type === "hero" ? "disabled checked" : ""} />
          <span>${escapeHtml(sectionLabels[section.type])}</span>
          <select name="sectionOrder:${section.type}" aria-label="${escapeHtml(sectionLabels[section.type])} order">
            ${renderSectionOrderOptions(sections.findIndex((candidate) => candidate.type === section.type))}
          </select>
        </label>
      `
    )
    .join("");
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
    return `
      <div class="experience-phone-actions">
        <span>Menu</span>
        <span>Orders</span>
        <span>Account</span>
      </div>
    `;
  }

  if (section.type === "featured_menu") {
    const items = state.menuCategories.flatMap((category) => category.items).slice(0, section.itemLimit ?? 4);
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
          ${
            canWrite
              ? `
                <form class="experience-form" data-form="mobile-experience">
                  <label class="field">
                    <span>Base template</span>
                    <select name="templateId">${renderTemplateOptions(draft)}</select>
                  </label>
                  <div class="experience-section-controls">
                    ${renderSectionToggles(sections)}
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
