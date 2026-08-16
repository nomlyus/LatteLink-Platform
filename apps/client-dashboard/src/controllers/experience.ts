import {
  mobileExperienceActionSchema,
  mobileExperienceSaveDraftRequestSchema,
  type MobileExperienceSection
} from "@lattelink/contracts-catalog";
import {
  publishOperatorMobileExperience,
  rollbackOperatorMobileExperience,
  saveOperatorMobileExperienceDraft
} from "../api.js";
import { canUpdateStoreSettings } from "../model.js";
import { handleOperatorActionError, loadDashboard } from "../lifecycle.js";
import { render } from "../render.js";
import { setError, state } from "../state.js";
import { addToast } from "../toast-runtime.js";

const supportedSectionTypes = ["hero", "quick_actions", "featured_menu", "news_cards"] as const;
type MobileExperienceAction = "open_menu" | "open_orders" | "open_account";

function parseAction(value: FormDataEntryValue | null, fallback: MobileExperienceAction) {
  const parsed = mobileExperienceActionSchema.safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseSectionOrder(formData: FormData) {
  const requested = [...supportedSectionTypes].sort((left, right) => {
    const leftOrder = Number.parseInt(String(formData.get(`sectionOrder:${left}`) ?? ""), 10);
    const rightOrder = Number.parseInt(String(formData.get(`sectionOrder:${right}`) ?? ""), 10);
    return (Number.isFinite(leftOrder) ? leftOrder : 999) - (Number.isFinite(rightOrder) ? rightOrder : 999);
  });

  const legacyOrder = String(formData.get("sectionOrder") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is (typeof supportedSectionTypes)[number] =>
      supportedSectionTypes.includes(value as (typeof supportedSectionTypes)[number])
    );
  const ordered = requested.length > 0 ? requested : legacyOrder;
  return [...ordered, ...supportedSectionTypes.filter((section) => !ordered.includes(section))];
}

function isSectionVisible(formData: FormData, type: string) {
  if (type === "hero") {
    return true;
  }
  return formData.get(`sectionVisible:${type}`) === "on";
}

function buildSections(formData: FormData): MobileExperienceSection[] {
  const order = parseSectionOrder(formData);
  const quickActions = ["open_menu", "open_orders", "open_account"]
    .filter((action) => formData.get(`quickAction:${action}`) === "on")
    .map((action) => parseAction(action, "open_menu"));

  return order.map((type) => {
    if (type === "hero") {
      return {
        id: "hero",
        type: "hero",
        visible: isSectionVisible(formData, type),
        title: String(formData.get("heroTitle") ?? "").trim(),
        subtitle: String(formData.get("heroSubtitle") ?? "").trim(),
        action: parseAction(formData.get("heroAction"), "open_menu"),
        actionLabel: String(formData.get("heroActionLabel") ?? "Order now").trim() || "Order now"
      };
    }

    if (type === "quick_actions") {
      return {
        id: "quick-actions",
        type: "quick_actions",
        visible: isSectionVisible(formData, type),
        title: "Quick actions",
        actions: quickActions.length > 0 ? quickActions : ["open_menu"]
      };
    }

    if (type === "featured_menu") {
      const categoryId = String(formData.get("featuredMenuCategoryId") ?? "").trim();
      return {
        id: "featured-menu",
        type: "featured_menu",
        visible: isSectionVisible(formData, type),
        title: String(formData.get("featuredMenuTitle") ?? "Popular today").trim() || "Popular today",
        ...(categoryId ? { categoryId } : {}),
        itemLimit: parsePositiveInt(formData.get("featuredMenuLimit"), 4)
      };
    }

    return {
      id: "news-cards",
      type: "news_cards",
      visible: isSectionVisible(formData, type),
      title: String(formData.get("newsCardsTitle") ?? "Latest").trim() || "Latest",
      cardLimit: parsePositiveInt(formData.get("newsCardsLimit"), 4)
    };
  });
}

export function handleMobileExperienceSectionMove(type: string, direction: "up" | "down") {
  if (!state.mobileExperience) {
    return;
  }

  const screen = state.mobileExperience.draft.screens.find((candidate) => candidate.id === "home");
  if (!screen) {
    return;
  }

  const index = screen.sections.findIndex((section) => section.type === type);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= screen.sections.length) {
    return;
  }

  const sections = [...screen.sections];
  const [section] = sections.splice(index, 1);
  if (!section) {
    return;
  }
  sections.splice(nextIndex, 0, section);
  screen.sections = sections;
  render();
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
        theme: {
          accentColor: String(formData.get("accentColor") ?? "").trim() || undefined,
          backgroundColor: String(formData.get("backgroundColor") ?? "").trim() || undefined,
          foregroundColor: String(formData.get("foregroundColor") ?? "").trim() || undefined
        },
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

export async function handleMobileExperienceRollback(versionId: string) {
  if (!state.session || !state.mobileExperience) {
    return;
  }
  if (!canUpdateStoreSettings(state.session.operator)) {
    setError("App experience publishing is read-only for your account.");
    render();
    return;
  }

  try {
    state.rollingBackMobileExperienceVersionId = versionId;
    setError(null);
    render();
    await rollbackOperatorMobileExperience(
      state.session,
      state.selectedLocationId === "all" ? null : state.selectedLocationId,
      versionId
    );
    addToast("Restored and published the selected app experience version.", "success");
    await loadDashboard();
  } catch (error) {
    await handleOperatorActionError(error, "Unable to restore app experience version.");
  } finally {
    state.rollingBackMobileExperienceVersionId = null;
    render();
  }
}
