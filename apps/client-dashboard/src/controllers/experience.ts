import {
  mobileExperienceSaveDraftRequestSchema,
  type MobileExperienceSection
} from "@lattelink/contracts-catalog";
import { publishOperatorMobileExperience, saveOperatorMobileExperienceDraft } from "../api.js";
import { canUpdateStoreSettings } from "../model.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";
import { setError, state } from "../state.js";
import { addToast } from "../toast-runtime.js";

const supportedSectionTypes = ["hero", "quick_actions", "featured_menu", "news_cards"] as const;

function parseSectionOrder(raw: FormDataEntryValue | null) {
  const requested = String(raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is (typeof supportedSectionTypes)[number] =>
      supportedSectionTypes.includes(value as (typeof supportedSectionTypes)[number])
    );
  const ordered = requested.length > 0 ? requested : [...supportedSectionTypes];
  return [...ordered, ...supportedSectionTypes.filter((section) => !ordered.includes(section))];
}

function isSectionVisible(formData: FormData, type: string) {
  if (type === "hero") {
    return true;
  }
  return formData.get(`sectionVisible:${type}`) === "on";
}

function buildSections(formData: FormData): MobileExperienceSection[] {
  const order = parseSectionOrder(formData.get("sectionOrder"));
  return order.map((type) => {
    if (type === "hero") {
      return {
        id: "hero",
        type: "hero",
        visible: isSectionVisible(formData, type),
        title: String(formData.get("heroTitle") ?? "").trim(),
        subtitle: String(formData.get("heroSubtitle") ?? "").trim(),
        action: "open_menu",
        actionLabel: String(formData.get("heroActionLabel") ?? "Order now").trim() || "Order now"
      };
    }

    if (type === "quick_actions") {
      return {
        id: "quick-actions",
        type: "quick_actions",
        visible: isSectionVisible(formData, type),
        title: "Quick actions",
        actions: ["open_menu", "open_orders", "open_account"]
      };
    }

    if (type === "featured_menu") {
      return {
        id: "featured-menu",
        type: "featured_menu",
        visible: isSectionVisible(formData, type),
        title: String(formData.get("featuredMenuTitle") ?? "Popular today").trim() || "Popular today",
        itemLimit: Number.parseInt(String(formData.get("featuredMenuLimit") ?? "4"), 10)
      };
    }

    return {
      id: "news-cards",
      type: "news_cards",
      visible: isSectionVisible(formData, type),
      title: String(formData.get("newsCardsTitle") ?? "Latest").trim() || "Latest",
      cardLimit: Number.parseInt(String(formData.get("newsCardsLimit") ?? "4"), 10)
    };
  });
}

export async function handleMobileExperienceSubmit(form: HTMLFormElement) {
  if (!state.session) {
    return;
  }
  if (!canUpdateStoreSettings(state.session.operator)) {
    setError("App experience editing is read-only for your account.");
    render();
    return;
  }

  const formData = new FormData(form);
  try {
    state.savingMobileExperience = true;
    setError(null);
    render();
    await saveOperatorMobileExperienceDraft(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      mobileExperienceSaveDraftRequestSchema.parse({
        versionId: state.mobileExperience?.draft.versionId,
        templateId: formData.get("templateId"),
        theme: state.mobileExperience?.draft.theme ?? {},
        protectedNavigation: ["home", "menu", "orders", "account"],
        screens: [
          {
            id: "home",
            title: String(formData.get("heroTitle") ?? "").trim(),
            sections: buildSections(formData)
          }
        ]
      })
    );
    addToast("Saved app experience draft.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to save app experience draft.");
  } finally {
    state.savingMobileExperience = false;
    render();
  }
}

export async function handleMobileExperiencePublish() {
  if (!state.session || !state.mobileExperience) {
    return;
  }
  if (!canUpdateStoreSettings(state.session.operator)) {
    setError("App experience publishing is read-only for your account.");
    render();
    return;
  }

  try {
    state.publishingMobileExperience = true;
    setError(null);
    render();
    await publishOperatorMobileExperience(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      state.mobileExperience.draft.versionId
    );
    addToast("Published app experience.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to publish app experience.");
  } finally {
    state.publishingMobileExperience = false;
    render();
  }
}
