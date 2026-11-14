# System interface colors

Interface colors live in `src/ui/createSystemPalette.ts`, with platform resolvers
in `systemColors.ios.ts`, `systemColors.android.ts` and `systemColors.ts`.
Existing imports from `ui/system` re-export the same palette.

- iOS uses `PlatformColor` with UIKit's actual semantic names. Native rendering
  resolves light/dark and increased-contrast variants; no copied iOS dark palette
  or cached hex conversion is used.
- Android uses color-valued native theme attributes. Divider drawables are not
  valid `PlatformColor` resources; border roles use color-control attributes.
- Web/non-native environments currently have a neutral light fallback. A web
  system-appearance palette is not implemented by this change.

Main pages use `systemBackground`; grouped cards use
`secondarySystemGroupedBackground`; secondary surfaces use
`secondarySystemBackground`. Text uses label roles and borders use separator
roles. The forest-green loyalty card, its logo, decorative brand colors, menu
artwork and launch assets retain their own colors.

Navigation follows the system appearance through `SystemAppearance`.
The shared app accent is Rawaq forest green (`#134733`), defined in `brandColors.ts`.
Primary actions and selected navigation/header controls use it; their filled-button
foreground is white. Neutral labels and cart-accessory copy retain semantic text colors.
Both navigation themes use the same brand accent without overriding system surfaces.

Status-bar text follows that same appearance without changing native status-bar ownership.
Glass inherits appearance (`auto`); fallback blur uses adaptive `systemMaterial`.
The native Apple sign-in buttons use Apple's contrasting black/white variants.
Date pickers retain their native label colors rather than receiving an unsupported
opaque color object through a string-only prop.

Order-progress transitions crossfade native-colored layers with animated opacity.
Do not feed `PlatformColor` objects into hex-only `interpolateColor` functions.
Status progression, timing, scale and line animations remain unchanged.

## Native build boundary

The prior dev client was built with `UIUserInterfaceStyle=Light`. App config now
uses `userInterfaceStyle: automatic`, and the checked-in iOS plist no longer
forces Light. Existing native color APIs and JS styling need no dependency upgrade,
but the native appearance-lock removal requires the next development-client build.
Do not claim that toggling the phone's appearance works in the old binary.
No build is automatically authorized by this change.

## Acceptance still required

Check Home, Menu, Search (idle/focused), History, cart, Account and its subpages,
authentication and checkout in both appearances on the next native build. Also
check increased contrast and reduced transparency. Native iOS/Android compilation
and complete physical-device dark-mode QA were not performed for this change.
Remaining screen-specific fixed/decorative colors need visual QA; this is not a
claim of complete app-wide dark-mode acceptance.
