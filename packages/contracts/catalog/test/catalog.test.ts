import { describe, expect, it } from "vitest";
import {
  adminMenuItemSchema,
  adminMenuItemImageUploadRequestSchema,
  adminMenuItemImageUploadResponseSchema,
  adminMenuItemUpdateSchema,
  adminClientCreateRequestSchema,
  adminClientCreateResponseSchema,
  adminStoreConfigSchema,
  adminStoreConfigUpdateSchema,
  appConfigSchema,
  buildDefaultCustomizationInput,
  catalogContract,
  clientPaymentProfileSchema,
  describeCustomizationSelection,
  internalLocationBootstrapSchema,
  stripeConnectDashboardLinkRequestSchema,
  stripeConnectLinkResponseSchema,
  stripeConnectOnboardingLinkRequestSchema,
  internalLocationListResponseSchema,
  internalLocationPaymentProfileUpdateSchema,
  internalLocationSummarySchema,
  isLoyaltyVisible,
  isOrderTrackingEnabled,
  isPlatformManagedMenu,
  launchApprovalRequestSchema,
  menuResponseSchema,
  mobileReleaseProfileUpdateSchema,
  onboardingSummarySchema,
  operatorOnboardingUpdateSchema,
  paymentReadinessSchema,
  priceMenuItemCustomization,
  resolveAppConfigFulfillmentMode,
  resolveMenuItemCustomization,
  storeConfigResponseSchema
} from "../src";

const espressoGroups = [
  {
    id: "size",
    label: "Size",
    selectionType: "single" as const,
    required: true,
    sortOrder: 0,
    options: [
      { id: "regular", label: "Regular", priceDeltaCents: 0, default: true },
      { id: "large", label: "Large", priceDeltaCents: 100 }
    ]
  },
  {
    id: "milk",
    label: "Milk",
    selectionType: "single" as const,
    required: true,
    sortOrder: 1,
    options: [
      { id: "whole", label: "Whole milk", priceDeltaCents: 0, default: true },
      { id: "oat", label: "Oat milk", priceDeltaCents: 75 }
    ]
  },
  {
    id: "toppings",
    label: "Toppings",
    selectionType: "multiple" as const,
    minSelections: 0,
    maxSelections: 2,
    sortOrder: 2,
    options: [
      { id: "cinnamon", label: "Cinnamon", priceDeltaCents: 25 },
      { id: "cold-foam", label: "Cold foam", priceDeltaCents: 150 }
    ]
  }
];

describe("contracts-catalog", () => {
  it("validates menu payload", () => {
    const payload = menuResponseSchema.parse({
      locationId: "flagship-01",
      currency: "USD",
      categories: [
        {
          id: "coffee",
          title: "Coffee",
          items: [
            {
              id: "latte",
              name: "Latte",
              description: "Espresso with steamed milk.",
              priceCents: 575,
              badgeCodes: ["popular"],
              visible: true
            }
          ]
        }
      ]
    });

    expect(payload.currency).toBe("USD");
    expect(payload.categories[0]?.items[0]?.name).toBe("Latte");
  });

  it("validates store config payload", () => {
    const config = storeConfigResponseSchema.parse({
      locationId: "flagship-01",
      hoursText: "Daily · 7:00 AM - 6:00 PM",
      isOpen: true,
      nextOpenAt: null,
      prepEtaMinutes: 12,
      taxRateBasisPoints: 600,
      pickupInstructions: "Pickup at the flagship order counter."
    });

    expect(config.taxRateBasisPoints).toBe(600);
    expect(config.isOpen).toBe(true);
    expect(config.nextOpenAt).toBeNull();
  });

  it("validates app config payload", () => {
    const config = appConfigSchema.parse({
      brand: {
        brandId: "gazelle-default",
        brandName: "Gazelle Coffee",
        locationId: "flagship-01",
        locationName: "Gazelle Coffee Flagship",
        marketLabel: "Ann Arbor, MI"
      },
      theme: {
        background: "#F7F4ED",
        backgroundAlt: "#F0ECE4",
        surface: "#FFFDF8",
        surfaceMuted: "#F3EFE7",
        foreground: "#171513",
        foregroundMuted: "#605B55",
        muted: "#9B9389",
        border: "rgba(23, 21, 19, 0.08)",
        primary: "#1E1B18",
        accent: "#2D2823",
        fontFamily: "System",
        displayFontFamily: "Fraunces"
      },
      enabledTabs: ["home", "menu", "orders", "account"],
      featureFlags: {
        loyalty: true,
        pushNotifications: true,
        refunds: true,
        orderTracking: true,
        staffDashboard: false,
        menuEditing: false
      },
      loyaltyEnabled: true,
      paymentCapabilities: {
        applePay: true,
        card: true,
        cash: false,
        refunds: true,
        stripe: {
          enabled: false,
          onboarded: false,
          dashboardEnabled: false
        },
        clover: {
          enabled: true,
          merchantRef: "flagship-01"
        }
      },
      fulfillment: {
        mode: "staff",
        timeBasedScheduleMinutes: {
          inPrep: 5,
          ready: 10,
          completed: 15
        }
      }
    });

    expect(config.brand.marketLabel).toBe("Ann Arbor, MI");
    expect(config.fulfillment.mode).toBe("staff");
    expect(config.storeCapabilities.menu.source).toBe("external_sync");
    expect(isPlatformManagedMenu(config)).toBe(false);
    expect(isOrderTrackingEnabled(config)).toBe(true);
    expect(isLoyaltyVisible(config)).toBe(true);
    expect(resolveAppConfigFulfillmentMode(config)).toBe("staff");
  });

  it("defaults fulfillment config for older app-config payloads to staff mode", () => {
    const config = appConfigSchema.parse({
      brand: {
        brandId: "gazelle-default",
        brandName: "Gazelle Coffee",
        locationId: "flagship-01",
        locationName: "Gazelle Coffee Flagship",
        marketLabel: "Ann Arbor, MI"
      },
      theme: {
        background: "#F7F4ED",
        backgroundAlt: "#F0ECE4",
        surface: "#FFFDF8",
        surfaceMuted: "#F3EFE7",
        foreground: "#171513",
        foregroundMuted: "#605B55",
        muted: "#9B9389",
        border: "rgba(23, 21, 19, 0.08)",
        primary: "#1E1B18",
        accent: "#2D2823",
        fontFamily: "System",
        displayFontFamily: "Fraunces"
      },
      enabledTabs: ["home", "menu", "orders", "account"],
      featureFlags: {
        loyalty: true,
        pushNotifications: true,
        refunds: true,
        orderTracking: true,
        staffDashboard: false,
        menuEditing: false
      },
      loyaltyEnabled: true,
      paymentCapabilities: {
        applePay: true,
        card: true,
        cash: false,
        refunds: true,
        stripe: {
          enabled: false,
          onboarded: false,
          dashboardEnabled: false
        },
        clover: {
          enabled: true,
          merchantRef: "flagship-01"
        }
      }
    });

    expect(config.fulfillment.mode).toBe("staff");
    expect(config.fulfillment.timeBasedScheduleMinutes.ready).toBe(10);
  });

  it("exposes app-config contract metadata", () => {
    expect(catalogContract.routes.appConfig.path).toBe("/app-config");
    expect(catalogContract.routes.menu.path).toBe("/menu");
    expect(catalogContract.routes.storeConfig.path).toBe("/store/config");
  });

  it("validates admin menu and store config payloads", () => {
    const adminItem = adminMenuItemSchema.parse({
      itemId: "latte",
      categoryId: "espresso",
      categoryTitle: "Espresso Bar",
      name: "Honey Oat Latte",
      description: "Espresso with oat milk",
      imageUrl: "https://assets.example.com/menu/honey-oat-latte.jpg",
      priceCents: 675,
      visible: true,
      sortOrder: 0
    });
    const adminStoreConfig = adminStoreConfigSchema.parse({
      locationId: "flagship-01",
      storeName: "Gazelle Coffee",
      locationName: "Ann Arbor, MI",
      hours: "Daily · 7:00 AM - 6:00 PM",
      pickupInstructions: "Pickup at the flagship order counter.",
      taxRateBasisPoints: 600
    });

    expect(adminItem.categoryTitle).toBe("Espresso Bar");
    expect(adminStoreConfig.storeName).toBe("Gazelle Coffee");
    expect(adminStoreConfig.locationName).toBe("Ann Arbor, MI");
    expect(adminStoreConfig.capabilities.operations.fulfillmentMode).toBe("staff");
    expect(adminStoreConfig.capabilities.operations.dashboardEnabled).toBe(true);
  });

  it("validates admin update payloads", () => {
    const menuUpdate = adminMenuItemUpdateSchema.parse({
      name: "Iced Cortado",
      priceCents: 575,
      visible: false,
      imageUrl: null
    });
    const storeUpdate = adminStoreConfigUpdateSchema.parse({
      storeName: "Gazelle Coffee Downtown",
      locationName: "Ann Arbor, MI",
      hours: "Weekdays · 6:30 AM - 5:00 PM",
      pickupInstructions: "Use the front pickup shelves.",
      taxRateBasisPoints: 650,
      capabilities: {
        menu: {
          source: "external_sync"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: false,
          dashboardEnabled: false
        },
        loyalty: {
          visible: false
        }
      }
    });

    expect(menuUpdate.visible).toBe(false);
    expect(storeUpdate.hours).toContain("Weekdays");
    expect(storeUpdate.taxRateBasisPoints).toBe(650);
    expect(storeUpdate.capabilities?.menu.source).toBe("external_sync");
    expect(catalogContract.routes.adminMenu.path).toBe("/admin/menu");
    expect(catalogContract.routes.adminStoreConfig.path).toBe("/admin/store/config");
  });

  it("validates admin menu image upload payloads", () => {
    const uploadRequest = adminMenuItemImageUploadRequestSchema.parse({
      fileName: "iced-latte.png",
      contentType: "image/png",
      sizeBytes: 245_120
    });
    const uploadResponse = adminMenuItemImageUploadResponseSchema.parse({
      uploadMethod: "PUT",
      uploadUrl: "https://example.r2.cloudflarestorage.com/bucket/key",
      uploadHeaders: {
        "content-type": "image/png"
      },
      assetUrl: "https://media.example.com/locations/flagship-01/menu/iced-latte.png",
      variantUploads: [
        {
          variant: "mobile-list",
          uploadMethod: "PUT",
          uploadUrl: "https://example.r2.cloudflarestorage.com/bucket/mobile-list/key",
          uploadHeaders: {
            "content-type": "image/jpeg"
          },
          assetUrl: "https://media.example.com/locations/flagship-01/menu/mobile-list/iced-latte.jpg",
          contentType: "image/jpeg",
          width: 320,
          quality: 0.72
        }
      ],
      expiresAt: "2026-04-23T22:00:00.000Z"
    });

    expect(uploadRequest.contentType).toBe("image/png");
    expect(uploadResponse.uploadMethod).toBe("PUT");
    expect(uploadResponse.variantUploads[0]?.variant).toBe("mobile-list");
    expect(catalogContract.routes.adminMenuItemImageUpload.path).toBe("/admin/menu/:itemId/image-upload");
  });

  it("validates internal location bootstrap and summary payloads", () => {
    const bootstrap = internalLocationBootstrapSchema.parse({
      brandId: "northside-coffee",
      brandName: "Northside Coffee",
      locationId: "northside-01",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI",
      capabilities: {
        menu: {
          source: "platform_managed"
        },
        operations: {
          fulfillmentMode: "staff",
          liveOrderTrackingEnabled: true,
          dashboardEnabled: true
        },
        loyalty: {
          visible: true
        }
      },
      paymentProfile: {
        locationId: "northside-01",
        stripeAccountType: "express",
        stripeOnboardingStatus: "pending",
        stripeDetailsSubmitted: false,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDashboardEnabled: false,
        country: "US",
        currency: "USD",
        cardEnabled: true,
        applePayEnabled: true,
        refundsEnabled: true,
        cloverPosEnabled: true
      }
    });

    const summary = internalLocationSummarySchema.parse({
      ...bootstrap,
      storeName: "Northside Coffee",
      hours: "Daily · 7:00 AM - 6:00 PM",
      pickupInstructions: "Pickup at the espresso counter.",
      taxRateBasisPoints: 675,
      capabilities: bootstrap.capabilities,
      paymentProfile: bootstrap.paymentProfile,
      paymentReadiness: {
        ready: false,
        onboardingState: "pending",
        missingRequiredFields: ["stripeAccountId", "stripeChargesEnabled", "stripePayoutsEnabled"]
      },
      action: "created"
    });

    expect(summary.locationId).toBe("northside-01");
    expect(summary.action).toBe("created");

    const list = internalLocationListResponseSchema.parse({
      locations: [summary]
    });

    expect(list.locations).toHaveLength(1);
  });

  it("allows internal location bootstrap payloads without generated identifiers", () => {
    const bootstrap = internalLocationBootstrapSchema.parse({
      brandName: "Northside Coffee",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI"
    });

    expect(bootstrap.brandId).toBeUndefined();
    expect(bootstrap.locationId).toBeUndefined();
  });

  it("validates admin client create contracts with response-owned identifiers", () => {
    const request = adminClientCreateRequestSchema.parse({
      clientName: "Northside Coffee",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI",
      ownerEmail: "owner@northside.example",
      ownerName: "Avery Owner",
      storeName: "Northside Coffee",
      taxRateBasisPoints: 675
    });

    expect(request.clientName).toBe("Northside Coffee");
    expect("tenantId" in request).toBe(false);
    expect("locationId" in request).toBe(false);

    expect(() =>
      adminClientCreateRequestSchema.parse({
        ...request,
        locationId: "client_supplied"
      })
    ).toThrow();

    const response = adminClientCreateResponseSchema.parse({
      tenantId: "ten_123",
      locationId: "loc_123",
      onboarding: {
        tenantId: "ten_123",
        brandId: "brd_123",
        brandName: "Northside Coffee",
        locationId: "loc_123",
        locationName: "Northside Flagship",
        marketLabel: "Detroit, MI",
        status: "invited",
        readyForReview: false,
        checklist: [
          {
            id: "owner_invited",
            label: "Owner invited",
            status: "complete",
            passed: true
          },
          {
            id: "payments_connected",
            label: "Payments connected",
            status: "pending",
            passed: false
          }
        ],
        mobileRelease: {
          locationId: "loc_123",
          status: "not_started"
        }
      }
    });

    expect(response.tenantId).toBe("ten_123");
    expect(response.onboarding.checklist[0]?.required).toBe(true);
  });

  it("validates complete onboarding summaries", () => {
    const summary = onboardingSummarySchema.parse({
      tenantId: "ten_123",
      brandId: "brd_123",
      brandName: "Northside Coffee",
      locationId: "loc_123",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI",
      status: "ready_for_review",
      readyForReview: true,
      checklist: [
        "owner_invited",
        "owner_activated",
        "business_profile_complete",
        "store_operations_complete",
        "payments_connected",
        "menu_ready",
        "team_configured_or_skipped",
        "test_order_completed",
        "mobile_release_ready",
        "admin_launch_approved"
      ].map((id) => ({
        id,
        label: id.replaceAll("_", " "),
        status: "complete",
        passed: true
      })),
      paymentReadiness: {
        ready: true,
        onboardingState: "completed",
        missingRequiredFields: []
      },
      mobileRelease: {
        locationId: "loc_123",
        status: "ready_for_launch",
        buildNumber: "42"
      },
      submittedForReviewAt: "2026-05-06T12:00:00.000Z"
    });

    expect(summary.readyForReview).toBe(true);
    expect(summary.checklist.every((item) => item.passed)).toBe(true);
  });

  it("validates incomplete and blocked onboarding summaries", () => {
    const incomplete = onboardingSummarySchema.parse({
      tenantId: "ten_123",
      brandId: "brd_123",
      brandName: "Northside Coffee",
      locationId: "loc_123",
      locationName: "Northside Flagship",
      marketLabel: "Detroit, MI",
      status: "in_progress",
      readyForReview: false,
      checklist: [
        {
          id: "owner_activated",
          label: "Owner activated",
          status: "pending",
          passed: false
        }
      ]
    });

    const blocked = onboardingSummarySchema.parse({
      ...incomplete,
      status: "blocked",
      blockedReason: "App Store metadata is waiting on client assets.",
      checklist: [
        {
          id: "mobile_release_ready",
          label: "Mobile release ready",
          status: "blocked",
          passed: false,
          manual: true,
          detail: "Waiting on app icon."
        }
      ],
      mobileRelease: {
        locationId: "loc_123",
        status: "blocked",
        blockedReason: "Waiting on app icon."
      }
    });

    expect(incomplete.readyForReview).toBe(false);
    expect(blocked.blockedReason).toContain("App Store");
  });

  it("validates operator onboarding, launch approval, and mobile release updates", () => {
    const operatorUpdate = operatorOnboardingUpdateSchema.parse({
      businessProfileComplete: true,
      storeOperationsComplete: true,
      menuReady: false,
      teamConfiguredOrSkipped: true,
      readyForReview: false,
      blockedReason: null
    });

    const launchApproval = launchApprovalRequestSchema.parse({
      approved: true,
      note: "Ready for pilot launch."
    });

    const mobileReleaseUpdate = mobileReleaseProfileUpdateSchema.parse({
      status: "submitted_for_review",
      submittedAt: "2026-05-06T12:00:00.000Z",
      testFlightUrl: "https://testflight.apple.com/join/example"
    });

    expect(operatorUpdate.menuReady).toBe(false);
    expect(launchApproval.approved).toBe(true);
    expect(mobileReleaseUpdate.status).toBe("submitted_for_review");
  });

  it("validates payment profile payloads", () => {
    const paymentProfile = clientPaymentProfileSchema.parse({
      locationId: "northside-01",
      stripeAccountId: "acct_123456789",
      stripeAccountType: "express",
      stripeOnboardingStatus: "completed",
      stripeDetailsSubmitted: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDashboardEnabled: true,
      country: "US",
      currency: "USD",
      cardEnabled: true,
      applePayEnabled: true,
      refundsEnabled: true,
      cloverPosEnabled: true,
      createdAt: "2026-04-21T12:00:00.000Z",
      updatedAt: "2026-04-21T12:00:00.000Z"
    });

    const update = internalLocationPaymentProfileUpdateSchema.parse({
      ...paymentProfile,
      locationId: "northside-01"
    });
    const readiness = paymentReadinessSchema.parse({
      ready: true,
      onboardingState: "completed",
      missingRequiredFields: []
    });

    expect(update.locationId).toBe("northside-01");
    expect(readiness.ready).toBe(true);
  });

  it("validates Stripe Connect link payloads", () => {
    const onboardingRequest = stripeConnectOnboardingLinkRequestSchema.parse({
      locationId: "northside-01",
      returnUrl: "https://admin.example.com/clients/northside-01/payments",
      refreshUrl: "https://admin.example.com/clients/northside-01/payments?refresh=1"
    });

    const dashboardRequest = stripeConnectDashboardLinkRequestSchema.parse({
      locationId: "northside-01"
    });

    const response = stripeConnectLinkResponseSchema.parse({
      locationId: "northside-01",
      stripeAccountId: "acct_123456789",
      url: "https://connect.stripe.com/setup/s/test_123",
      expiresAt: "2026-04-22T12:00:00.000Z",
      paymentProfile: {
        locationId: "northside-01",
        stripeAccountId: "acct_123456789",
        stripeAccountType: "express",
        stripeOnboardingStatus: "pending",
        stripeDetailsSubmitted: false,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDashboardEnabled: true,
        country: "US",
        currency: "USD",
        cardEnabled: true,
        applePayEnabled: true,
        refundsEnabled: true,
        cloverPosEnabled: false
      },
      paymentReadiness: {
        ready: false,
        onboardingState: "pending",
        missingRequiredFields: ["stripeChargesEnabled", "stripePayoutsEnabled"]
      }
    });

    expect(onboardingRequest.locationId).toBe("northside-01");
    expect(dashboardRequest.locationId).toBe("northside-01");
    expect(response.paymentProfile.stripeDashboardEnabled).toBe(true);
  });

  it("rejects invalid store tax rate", () => {
    expect(() =>
      storeConfigResponseSchema.parse({
        locationId: "flagship-01",
        hoursText: "Daily · 7:00 AM - 6:00 PM",
        isOpen: true,
        nextOpenAt: null,
        prepEtaMinutes: 12,
        taxRateBasisPoints: 10001,
        pickupInstructions: "Pickup at the flagship order counter."
      })
    ).toThrow();
  });

  it("builds defaults for required single-select groups", () => {
    const defaults = buildDefaultCustomizationInput(espressoGroups);

    expect(defaults.selectedOptions).toEqual([
      { groupId: "milk", optionId: "whole" },
      { groupId: "size", optionId: "regular" }
    ]);
  });

  it("accepts valid required single-select selections", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" }
        ]
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.customizationDeltaCents).toBe(175);
  });

  it("rejects missing required groups", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [{ groupId: "size", optionId: "large" }]
      }
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.issues.some((issue) => issue.code === "group_missing_required" && issue.groupId === "milk")).toBe(true);
  });

  it("accepts valid multi-select groups within limits", () => {
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "regular" },
          { groupId: "milk", optionId: "whole" },
          { groupId: "toppings", optionId: "cinnamon" },
          { groupId: "toppings", optionId: "cold-foam" }
        ]
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.customizationDeltaCents).toBe(175);
  });

  it("rejects selections over maxSelections", () => {
    const resolved = resolveMenuItemCustomization({
      groups: [
        {
          id: "extras",
          label: "Extras",
          selectionType: "multiple" as const,
          maxSelections: 1,
          options: [
            { id: "one", label: "One", priceDeltaCents: 50 },
            { id: "two", label: "Two", priceDeltaCents: 75 }
          ]
        }
      ],
      selection: {
        selectedOptions: [
          { groupId: "extras", optionId: "one" },
          { groupId: "extras", optionId: "two" }
        ]
      }
    });

    expect(resolved.valid).toBe(false);
    expect(resolved.issues.some((issue) => issue.code === "group_above_max")).toBe(true);
  });

  it("prices multiple option deltas and quantity", () => {
    const priced = priceMenuItemCustomization({
      basePriceCents: 675,
      quantity: 3,
      groups: espressoGroups,
      selection: {
        selectedOptions: [
          { groupId: "size", optionId: "large" },
          { groupId: "milk", optionId: "oat" },
          { groupId: "toppings", optionId: "cinnamon" }
        ]
      }
    });

    expect(priced.unitPriceCents).toBe(875);
    expect(priced.lineTotalCents).toBe(2625);
  });

  it("supports items with no customization groups", () => {
    const resolved = resolveMenuItemCustomization({
      groups: [],
      selection: {
        notes: "warm it up"
      }
    });

    expect(resolved.valid).toBe(true);
    expect(resolved.groupSelections).toEqual([]);
    expect(resolved.customizationDeltaCents).toBe(0);
    expect(resolved.input.notes).toBe("warm it up");
  });

  it("describes selections in customization group order", () => {
    const selection = {
      selectedOptions: [
        { groupId: "milk", optionId: "oat" },
        { groupId: "size", optionId: "large" },
        { groupId: "toppings", optionId: "cold-foam" },
        { groupId: "toppings", optionId: "cinnamon" }
      ],
      notes: ""
    };
    const resolved = resolveMenuItemCustomization({
      groups: espressoGroups,
      selection
    });

    expect(
      describeCustomizationSelection({
        selection,
        groupSelections: resolved.groupSelections,
        groupOrder: ["size", "milk", "toppings"],
        includeNotes: false
      })
    ).toBe("Large · Oat milk · Cinnamon, Cold foam");
  });
});
