# Contracts Packages

- `@lattelink/contracts-core`
- `@lattelink/contracts-auth`
- `@lattelink/contracts-catalog`
- `@lattelink/contracts-orders`
- `@lattelink/contracts-loyalty`
- `@lattelink/contracts-notifications`

These are the canonical API schemas for gateway, services, and SDK generation.

## Catalog Customization Model

`@lattelink/contracts-catalog` now owns the canonical menu customization model used by catalog, mobile, and orders.

Core concepts:
- `MenuItemCustomizationGroup`
- `MenuItemCustomizationOption`
- `MenuItemCustomizationInput`
- `MenuItemCustomizationSelection`

Supported group behavior:
- `selectionType: "single" | "multiple"`
- `required`
- `minSelections`
- `maxSelections`
- `default`
- `priceDeltaCents`
- `sortOrder`
- optional `description`
- optional `displayStyle`
- optional `available`

Canonical helpers exported from `@lattelink/contracts-catalog`:
- `normalizeCustomizationGroups(...)`
- `normalizeCustomizationInput(...)`
- `buildDefaultCustomizationInput(...)`
- `resolveMenuItemCustomization(...)`
- `priceMenuItemCustomization(...)`
- `describeCustomizationSelection(...)`

These helpers are the shared source of truth for:
- normalizing item customization data from storage
- building default selections
- validating group/option selections
- generating cart-safe selection snapshots
- computing unit pricing from base item price plus option deltas

### Storage Shape

Catalog storage remains relational plus JSON:
- menu items live in relational catalog tables
- customization configuration is carried in `catalog_menu_items.customization_groups_json`

The JSON field should serialize cleanly to the contract schema. Example reusable group:

```json
{
  "id": "core:size",
  "label": "Size",
  "selectionType": "single",
  "required": true,
  "minSelections": 1,
  "maxSelections": 1,
  "sortOrder": 0,
  "options": [
    {
      "id": "regular",
      "label": "Regular",
      "priceDeltaCents": 0,
      "default": true,
      "sortOrder": 0,
      "available": true
    },
    {
      "id": "large",
      "label": "Large",
      "priceDeltaCents": 100,
      "sortOrder": 1,
      "available": true
    }
  ]
}
```

Example item configurations:

Simple coffee item:
```json
[
  {
    "id": "core:size",
    "label": "Size",
    "selectionType": "single",
    "required": true,
    "minSelections": 1,
    "maxSelections": 1,
    "sortOrder": 0,
    "options": [
      { "id": "regular", "label": "Regular", "priceDeltaCents": 0, "default": true, "sortOrder": 0 },
      { "id": "large", "label": "Large", "priceDeltaCents": 100, "sortOrder": 1 }
    ]
  },
  {
    "id": "core:milk",
    "label": "Milk",
    "selectionType": "single",
    "required": true,
    "minSelections": 1,
    "maxSelections": 1,
    "sortOrder": 1,
    "options": [
      { "id": "whole", "label": "Whole milk", "priceDeltaCents": 0, "default": true, "sortOrder": 0 },
      { "id": "oat", "label": "Oat milk", "priceDeltaCents": 75, "sortOrder": 1 }
    ]
  }
]
```

Matcha item:
```json
[
  {
    "id": "core:size",
    "label": "Size",
    "selectionType": "single",
    "required": true,
    "minSelections": 1,
    "maxSelections": 1,
    "sortOrder": 0,
    "options": [
      { "id": "regular", "label": "Regular", "priceDeltaCents": 0, "default": true, "sortOrder": 0 },
      { "id": "large", "label": "Large", "priceDeltaCents": 100, "sortOrder": 1 }
    ]
  },
  {
    "id": "matcha:sweetness",
    "label": "Sweetness",
    "selectionType": "single",
    "required": true,
    "minSelections": 1,
    "maxSelections": 1,
    "sortOrder": 1,
    "options": [
      { "id": "less", "label": "Less sweet", "priceDeltaCents": 0, "default": true, "sortOrder": 0 },
      { "id": "standard", "label": "Standard sweet", "priceDeltaCents": 0, "sortOrder": 1 }
    ]
  }
]
```

Item with no modifiers:
```json
[]
```

## Orders Quote Flow

`@lattelink/contracts-orders` now accepts modifier-aware quote lines instead of just item IDs plus quantity.

Quote request shape:

```ts
{
  locationId: string;
  items: Array<{
    itemId: string;
    quantity: number;
    customization: {
      selectedOptions: Array<{
        groupId: string;
        optionIds: string[];
      }>;
      notes: string;
    };
  }>;
  pointsToRedeem?: number;
}
```

Quote and order items can now preserve:
- `itemId`
- `itemName`
- `quantity`
- `unitPriceCents`
- `lineTotalCents`
- customization selection snapshots

The orders service uses the shared catalog helpers to:
- load the real catalog item definition
- validate the submitted customization input
- reject invalid or unavailable option IDs
- compute pricing from base item price plus selected option deltas

This keeps the frontend from being the final pricing or validation authority.

## Current Integration

The active flow is:
1. catalog stores item customization configuration in JSON
2. mobile normalizes item customization data from the shared catalog contract
3. the customize modal renders groups dynamically from item data
4. cart stores generic selection snapshots instead of hardcoded fields
5. checkout submits quote lines with customization input
6. orders revalidates and reprices selections from catalog data before quoting

## Notes

- Existing items with no customization groups still work.
- Legacy stored group shapes are normalized by the shared catalog helpers where practical.
- End-to-end payment/order tests that bind local sockets may still require a less restricted environment than the current sandbox.
