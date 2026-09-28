import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../src/api";
import { state } from "../src/state";

const createOperatorMenuItem = vi.hoisted(() => vi.fn());
const updateOperatorMenuItem = vi.hoisted(() => vi.fn());
const updateOperatorMenuCategory = vi.hoisted(() => vi.fn());
const reorderOperatorMenuCategories = vi.hoisted(() => vi.fn());
const createOperatorModifierGroup = vi.hoisted(() => vi.fn());
const updateOperatorModifierGroup = vi.hoisted(() => vi.fn());
const deleteOperatorModifierGroup = vi.hoisted(() => vi.fn());
const loadDashboard = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());

vi.mock("../src/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api")>()),
  createOperatorMenuItem,
  updateOperatorMenuItem,
  updateOperatorMenuCategory,
  reorderOperatorMenuCategories,
  createOperatorModifierGroup,
  updateOperatorModifierGroup,
  deleteOperatorModifierGroup
}));
vi.mock("../src/lifecycle", () => ({ loadDashboard, handleOperatorActionError: vi.fn() }));
vi.mock("../src/render", () => ({ render }));
vi.mock("../src/toast-runtime", () => ({ addToast: vi.fn() }));

const formDataFields = new WeakMap<object, Record<string, string | boolean | string[] | null>>();

class FormDataMock {
  private readonly fields: Record<string, string | boolean | string[] | null>;

  constructor(form: object) {
    this.fields = formDataFields.get(form) ?? {};
  }

  get(name: string) {
    const value = this.fields[name];
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }

  getAll(name: string) {
    const value = this.fields[name];
    return Array.isArray(value) ? value : value === null || value === undefined ? [] : [String(value)];
  }
}

class InputMock {
  checked: boolean;

  constructor(checked: boolean) {
    this.checked = checked;
  }
}

function fakeForm(options: {
  fields?: Record<string, string | boolean | string[] | null>;
  dataset?: Record<string, string>;
  checks?: Record<string, boolean>;
  rows?: Array<{ controls: Record<string, { value?: string; checked?: boolean }> }>;
}) {
  const form = {
    dataset: options.dataset ?? {},
    elements: { namedItem: (name: string) => new InputMock(options.checks?.[name] ?? false) },
    querySelectorAll: () => (options.rows ?? []).map((row) => ({
      querySelector: (selector: string) => {
        const name = selector.match(/name="([^"]+)"/)?.[1];
        return name ? row.controls[name] ?? null : null;
      }
    }))
  } as unknown as HTMLFormElement;
  formDataFields.set(form, options.fields ?? {});
  return form;
}

const item = {
  itemId: "latte",
  categoryId: "drinks",
  categoryTitle: "Drinks",
  categoryIds: ["drinks"],
  name: "Latte",
  description: "Espresso with milk",
  imageUrl: "https://images.example/latte.jpg",
  priceCents: 650,
  badgeCodes: ["popular"],
  visible: true,
  available: true,
  featured: false,
  modifierGroupAssignments: [{ modifierGroupId: "milk", sortOrder: 0 }],
  customizationGroups: [],
  sortOrder: 4
};

function prepare() {
  state.session = { operator: { role: "owner", capabilities: ["menu:read", "menu:write", "menu:visibility"] } } as never;
  state.selectedLocationId = "loc_a";
  state.appConfig = {
    storeCapabilities: {
      menu: { source: "platform_managed" },
      operations: { fulfillmentMode: "staff", liveOrderTrackingEnabled: true, dashboardEnabled: true },
      loyalty: { visible: true }
    }
  } as never;
  state.menuCategories = [
    { categoryId: "drinks", title: "Drinks", description: "Coffee", visible: true, sortOrder: 0, items: [item] },
    { categoryId: "seasonal", title: "Seasonal", description: "", visible: true, sortOrder: 1, items: [] }
  ] as never;
  state.menuModifierGroups = [];
  state.menuDialogKind = "item";
  state.menuDialogEntityId = "latte";
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  state.session = null;
  state.selectedLocationId = null;
  state.appConfig = null;
  state.menuCategories = [];
  state.menuModifierGroups = [];
  state.menuDialogKind = null;
  state.menuDialogEntityId = null;
  state.errorMessage = null;
  state.busyMenuItemId = null;
  state.creatingMenuItem = false;
});

describe("operator menu controllers", () => {
  it("creates an item with server-contract cents and then opens its editor", async () => {
    prepare();
    vi.stubGlobal("FormData", FormDataMock);
    createOperatorMenuItem.mockResolvedValue({ itemId: "new-item" });
    const form = fakeForm({
      fields: { categoryId: "drinks", name: "Flat White", price: "4.25" },
      checks: { visible: true, available: false }
    });

    const { handleMenuQuickCreateSubmit } = await import("../src/controllers/menu");
    await handleMenuQuickCreateSubmit(form);

    expect(createOperatorMenuItem).toHaveBeenCalledWith(expect.anything(), "loc_a", expect.objectContaining({
      categoryId: "drinks",
      name: "Flat White",
      priceCents: 425,
      visible: true,
      available: false
    }));
    expect(state.menuDialogKind).toBe("item");
    expect(state.menuDialogEntityId).toBe("new-item");
    expect(loadDashboard).toHaveBeenCalled();
  });

  it("updates an item without dropping unrelated editable fields or relational assignments", async () => {
    prepare();
    vi.stubGlobal("FormData", FormDataMock);
    vi.stubGlobal("HTMLInputElement", InputMock);
    updateOperatorMenuItem.mockResolvedValue(item);
    const form = fakeForm({
      dataset: { itemId: "latte" },
      fields: { name: "Large Latte", description: "Double shot", price: "7.15", badgeCodes: "popular, seasonal", categoryIds: ["drinks", "seasonal"], modifierGroupId: ["milk"] },
      checks: { visible: false, available: true, featured: true }
    });

    const { handleMenuItemSubmit } = await import("../src/controllers/menu");
    await handleMenuItemSubmit(form);

    expect(updateOperatorMenuItem).toHaveBeenCalledWith(expect.anything(), "loc_a", "latte", expect.objectContaining({
      name: "Large Latte",
      description: "Double shot",
      priceCents: 715,
      imageUrl: item.imageUrl,
      visible: false,
      available: true,
      featured: true,
      badgeCodes: ["popular", "seasonal"],
      categoryIds: ["drinks", "seasonal"],
      modifierGroupAssignments: [{ modifierGroupId: "milk", sortOrder: 0 }],
      sortOrder: 4
    }));
  });

  it("supports changing an item's primary category without removing its other memberships", async () => {
    prepare();
    vi.stubGlobal("FormData", FormDataMock);
    vi.stubGlobal("HTMLInputElement", InputMock);
    updateOperatorMenuItem.mockResolvedValue(item);
    const form = fakeForm({
      dataset: { itemId: "latte" },
      fields: { name: "Latte", price: "6.50", categoryIds: ["drinks", "seasonal"], primaryCategoryId: "seasonal" },
      checks: { visible: true, available: true, featured: false }
    });

    const { handleMenuItemSubmit } = await import("../src/controllers/menu");
    await handleMenuItemSubmit(form);

    expect(updateOperatorMenuItem).toHaveBeenCalledWith(expect.anything(), "loc_a", "latte", expect.objectContaining({
      categoryIds: ["seasonal", "drinks"]
    }));
  });

  it("updates category membership while retaining the item's primary placement and fields", async () => {
    prepare();
    vi.stubGlobal("FormData", FormDataMock);
    updateOperatorMenuItem.mockResolvedValue(item);
    updateOperatorMenuCategory.mockResolvedValue({});
    const form = fakeForm({
      dataset: { categoryId: "seasonal" },
      fields: { title: "Seasonal", description: "Limited time", categoryMemberItemIds: ["latte"], sortOrder: "1" },
      checks: { visible: true }
    });

    const { handleMenuCategorySubmit } = await import("../src/controllers/menu");
    await handleMenuCategorySubmit(form);

    expect(updateOperatorMenuItem).toHaveBeenCalledWith(expect.anything(), "loc_a", "latte", expect.objectContaining({
      name: "Latte",
      priceCents: 650,
      imageUrl: item.imageUrl,
      categoryIds: ["drinks", "seasonal"],
      modifierGroupAssignments: [{ modifierGroupId: "milk", sortOrder: 0 }]
    }));
    expect(updateOperatorMenuCategory).toHaveBeenCalledWith(expect.anything(), "loc_a", "seasonal", expect.objectContaining({ title: "Seasonal" }));
  });

  it("submits reusable modifier options with negative cent deltas and preserved metadata", async () => {
    prepare();
    vi.stubGlobal("FormData", FormDataMock);
    createOperatorModifierGroup.mockResolvedValue({ id: "milk", label: "Milk" });
    const form = fakeForm({
      fields: { label: "Milk choice", description: "Choose milk", selectionType: "multiple", minSelections: "1", maxSelections: "3", sortOrder: "2", sourceGroupId: "source-milk", displayStyle: "chips" },
      checks: { required: true },
      rows: [{ controls: {
        optionLabel: { value: "Oat" },
        optionDescription: { value: "Plant based" },
        optionPriceDelta: { value: "-0.75" },
        optionDefault: { checked: true },
        optionAvailable: { checked: false },
        optionId: { value: "oat" },
        optionDisplayStyle: { value: "emphasis" }
      } }]
    });

    const { handleModifierGroupSubmit } = await import("../src/controllers/menu");
    await handleModifierGroupSubmit(form);

    expect(createOperatorModifierGroup).toHaveBeenCalledWith(expect.anything(), "loc_a", expect.objectContaining({
      sourceGroupId: "source-milk",
      label: "Milk choice",
      selectionType: "multiple",
      required: true,
      minSelections: 1,
      maxSelections: 3,
      displayStyle: "chips",
      options: [{
        id: "oat",
        label: "Oat",
        description: "Plant based",
        priceDeltaCents: -75,
        default: true,
        available: false,
        sortOrder: 0,
        displayStyle: "emphasis"
      }]
    }));
  });

  it("surfaces an assigned-group delete conflict instead of hiding the failure", async () => {
    prepare();
    deleteOperatorModifierGroup.mockRejectedValue(new ApiRequestError("In use", 409, { code: "MODIFIER_GROUP_IN_USE" }));

    const { handleModifierGroupDelete } = await import("../src/controllers/menu");
    await handleModifierGroupDelete("milk");

    expect(state.errorMessage).toContain("assigned to one or more items");
    expect(state.errorMessage).toContain("Remove those assignments");
  });
});
