# Client onboarding to App Store publication

Status: product flow agreed; owner onboarding/submission implemented locally;
invitation hardening, notification, and publication authorization still pending.
Date: 2026-10-14.
Evidence baseline: `6e76839` plus the current uncommitted working-tree changes.

## Local implementation checkpoint

The owner modal and submission slice now exists locally (uncommitted, undeployed).
This does not mean the whole client-to-publication specification is implemented.

- Home uses a brand-scoped React onboarding lifecycle, independent of the
  dashboard's selected-location preference. It reads authorized provisioned
  locations, preserves valid configuration, and resumes incomplete work.
- Steps are Locations, Payments, optional Team, and Review. Pickup instructions,
  app identity/listing, branding uploads, and menu preparation are not questions.
- Location editing preserves existing pickup instructions, with a generic fallback
  if absent. Current provisioning already supplies persisted defaults.
- Stripe uses existing hosted connection/status APIs. Callback URLs carry the
  originating location; the compatibility route validates authorization before
  restoring that scope. No payment-provider semantics are changed.
- Team management reuses `/team`, with an explicit per-location skip or verification
  of existing members. No new invitation or role model is implemented here.
- `PATCH /admin/onboarding` accepts isolated
  `{ submitOwnerSetup: true, locationIds: [...] }`. Gateway verifies access to all
  requested locations. Catalog compares that set to authoritative brand membership
  and validates saved names/hours/tax, Stripe readiness, and Team-or-skip.
- PostgreSQL records per-location submission and brand completion in one
  serializable transaction, with bounded serialization-conflict retry. Completion
  is idempotent and preserves timestamps. No release, approval, or live state is
  fabricated. The earlier `completeOwnerSetup` operation remains for compatibility;
  the new owner UI does not use that weaker basics-only operation.
- Owner progress is visible through existing onboarding records/Admin Console.
  Durable outbound Nomly notifications, passwordless invitation activation, and
  release-bound Go live/publication authorization are still separate pending slices.
- This slice relies on local migration `0060_owner_setup_completion`. There is no
  additional migration here, and no shared/dev/production migration was executed.

Verification includes the full Catalog suite against disposable PostgreSQL,
two-location rollback and concurrent submission, contract/Gateway authorization,
dashboard rendering/progress tests, and local modal interactions using a removed
disposable UI fixture. Real Stripe connection/submission was not performed.

## Scope and authority

This document records the agreed journey and separates it from current behavior.
It does not authorize deployment, change existing contracts, or claim the release
pipeline is operational end-to-end. Existing working-tree changes remain intact.

The owner receives an invitation, activates their account preferably without a
password, completes required business/payment/app information, and submits to
Nomly. Nomly prepares the app and manages build and review. When the release is
ready, the owner requests **Go live**. That request authorizes and alerts Nomly to
publish on the App Store; it does not publish automatically or enable ordering.

`owner-first-time-onboarding.md` describes the earlier local implementation,
whose completion gate accepts brand basics. It remains implementation evidence,
but that weaker completion gate is not the target defined here.

## Agreed owner experience

1. Nomly collects branding before dashboard onboarding, provisions the brand
   with one or more locations, and invites its primary owner.
2. A professional invitation email contains a button opening invitation
   acceptance. No client identifiers or native build configuration are requested.
3. The recipient activates the invited account through a supported secure auth
   method. Google, Apple, and passkeys are desired methods, not current equivalent
   invitation-activation capabilities.
4. A first-time, resumable onboarding modal collects only necessary missing
   information and adapts to the locations Nomly actually provisioned. Stripe
   runs through its hosted onboarding flow. Team setup may be skipped. Branding,
   menu preparation, and defaultable pickup instructions are not onboarding steps.
5. **Submit to Nomly** validates saved owner requirements server-side and records
   a durable handoff. Only a confirmed submission completes the first-time flow.
6. The modal never returns after submission. Missing information or requested
   corrections are handled in owner Settings, not by resurrecting onboarding.
7. Nomly obtains owner approval of the app UI/UX before building and submitting
   it. The owner sees progress while Nomly manages the release and Apple review.
8. Only after Apple approval, with publication still held, can the owner request
   **Go live**. The owner may wait for marketing or any other business reason;
   readiness does not create an automatic publication deadline.
9. The UI shows **Launch requested** until publication is confirmed.

Managers/store operators do not configure the brand, submit its onboarding, or
authorize publication. Existing domain permissions for Menu/Team/Orders remain
unchanged. Owner Settings must not expose internal secrets/native credentials.

## Lifecycle model

These are conceptual milestones, not proposed replacements for every existing
database enum. Invitation, onboarding, release jobs, and publication remain
distinct lifecycles with one assembled client-facing progress projection.

| Milestone | Evidence required | Next responsible party |
| --- | --- | --- |
| Invited | Pending invitation and tracked delivery attempt | Owner |
| Account activated | Secure invitation consumption and active account | Owner |
| Onboarding in progress | Persisted draft configuration | Owner |
| Submitted to Nomly | Valid owner requirements and recorded submission | Nomly |
| Build-ready | Valid configuration, technical prerequisites, and owner UI/UX approval | Nomly |
| Building / review | Recorded build, submission, and review evidence | Nomly |
| Ready for release | Owner-approved UI/UX and built/submitted release approved by Apple, awaiting publication | Owner |
| Launch requested | Owner authorization tied to that release | Nomly |
| Live | Confirmed App Store publication | Nomly / system reconciliation |

Failures and corrections are recorded alongside progress; they must not erase
submission, invent publication, or require account reactivation.

## Minimal onboarding contents and excluded work

The complete field ownership/editability matrix still requires classification.
The exclusions and dynamic location behavior below are agreed requirements, not
optional future polish. Do not make all existing contract fields mandatory form
inputs just because another validator currently requires them.

| Step | Existing inputs / evidence | Remaining decision |
| --- | --- | --- |
| Business and location | Confirm provisioned brand/location context; collect only necessary missing details | Required fields versus trusted provisioning/defaults; permitted later edits |
| App identity/listing | App/home-screen names, subtitle, description, support/privacy URLs; optional marketing/keywords | Required owner fields, approved shared URLs, and later edit restrictions |
| Payments | Connected Stripe account and reconciled completion/readiness | Exact submission gate and handling accounts awaiting provider verification |
| Team | Supported member/location assignments or explicit skip | Preserve existing access model; no invented role hierarchy |
| Review and submit | Persisted requirements summary with actionable omissions | Final approved owner-requirements matrix |

Do not force owners to enter bundle identifiers, SKUs, Expo/EAS project identity,
signing credentials, API targets, or monitoring settings. Those are technical
configuration. Do not collect Stripe banking/KYC secrets into a Nomly form.

### Defaults and work outside onboarding

- Pickup instructions have a persisted default and can be edited later in owner
  Settings. Do not show a required pickup-instructions onboarding question. Agree
  the actual default copy during implementation; runtime requirements can be
  satisfied by that default without requiring owner input.
- Nomly collects branding from the client earlier and uses it to prepare/code the
  app. No icon/splash/screenshot upload step belongs in current owner onboarding.
  Missing internal assets can block Nomly build/release readiness, not completion
  of an owner upload step that does not exist. Self-service branding/build
  automation is deferred.
- Menu setup happens after onboarding and may be performed by the owner or Nomly
  through authorized tools. An empty menu must not block owner submission. It may
  still block customer ordering/operational launch readiness.
- Test-order evidence is not automatically an owner-onboarding prerequisite just
  because it exists in the current launch checklist. Its QA timing/ownership must
  be defined separately; post-build checks cannot block the initial build.

### Dynamic location behavior

- Load authoritative authorized provisioned locations; do not assume a single
  location or ask the owner to provision the same locations again.
- With one location, show its necessary configuration directly without redundant
  selection. With several, make each location's required work and saved progress
  explicit; collect brand-wide information only once.
- Keep onboarding location targets separate from the dashboard's selected-location
  preference. All Locations is not a valid target for a location-specific write.
- Do not assume one Stripe account per brand or per location from this product
  rule. Current payment profiles are location-scoped; preserve backend semantics
  and establish any permitted connection reuse before implementation.
- Submission evaluates the required provisioned location set server-side. Handle
  concurrent provisioning changes explicitly instead of accepting a stale list.
- Adding locations after first-time completion does not reopen brand onboarding;
  any later configuration is managed through owner Settings/internal workflows.

## Three independent gates

### Provisioning and checklist policy

Nomly may provision all business/app configuration from client intake. Owner
onboarding must not require re-entering valid provisioned information. It shows
the provisioned context, asks only for necessary missing information, and
completes the owner actions that cannot be replaced by configuration defaults.
Authentication, provider-required Stripe verification, UI/UX approval, and
publication authorization remain separate authenticated/provider-backed actions.

The following checklist is the proposed operating control, not an implemented
new API or a replacement for existing validators. Evaluate each applicable
location and each environment-specific release. A task is complete only when
its evidence exists; a manually checked boolean alone is insufficient for
provider, build, approval, and publication facts.

| Stage | Required check | Completion evidence |
| --- | --- | --- |
| Client provisioning | Correct brand/client identity and primary-owner relationship | Persisted records and authorized account relationship |
| Client provisioning | All agreed locations provisioned under the correct brand | Location records and membership mapping |
| Client provisioning | Owner name/email and invitation destination verified | Correct invitation/account context; no secrets in evidence |
| Account activation | Invitation delivered through configured real provider | Tracked provider result; receipt is not guaranteed by API acceptance |
| Account activation | Owner securely activates the invited account | Atomic invite consumption/account activation and authenticated identity |
| Location configuration | Names, market and timezone correct for each location | Valid persisted location configuration |
| Location configuration | Operating hours, tax and preparation configuration present | Valid persisted operational configuration, using actual supported contracts |
| Location configuration | Default pickup instructions persisted | Runtime config projects the intended default; no onboarding input required |
| Location configuration | Menu source, staff fulfillment and operational capabilities correct | Authorized configuration; preserve existing real-launch staff requirement |
| Owner handoff | Stripe connection and required verification resolved for the applicable scope | Reconciled account status/charges/payouts under the agreed submission policy |
| Owner handoff | Team configured or explicitly skipped | Actual authorized member assignments or recorded owner skip |
| Owner handoff | Required provisioned data complete, with no missing owner actions | Server-evaluated requirements for the authoritative location set |
| Owner handoff | Submission recorded and Nomly notified | Durable submission/event and retryable notification status |
| App preparation | App/home-screen names and listing metadata prepared | Persisted app profile: category, subtitle, description, support/privacy URLs; optional fields explicitly assessed |
| App preparation | Branding and native assets prepared from earlier intake | Correct brand assets and usable icon/splash files; listing screenshots where required |
| App preparation | Target locations and runtime branding/features correct | Valid runtime/profile projections for the intended brand and locations |
| App preparation | Owner approves app UI/UX | Recorded approval tied to the reviewed app/release; not an inferred checkbox |
| Build preparation | Registered bundle/SKU/Apple Pay identity correct | Verified environment-specific identity; existing registrations preserved |
| Build preparation | EAS project, slug, scheme and update identity correct | Complete validated native/project manifest |
| Build preparation | Signing, push, Apple Sign-In and submission access configured as applicable | Successful approved preflight/provider checks; credentials remain protected |
| Build preparation | API environment, versions, monitoring and associated domains correct | Validated release environment and build manifest |
| Build preparation | Source and configuration snapshotted | Source SHA, manifest/config hash and resolved asset identity |
| Build and QA | Intended binary built and reviewed | Recorded EAS build identity, result and QA evidence |
| Operational QA | Menu prepared after onboarding | Correct visible/orderable catalog for launch; can be prepared by Nomly or owner |
| Operational QA | Customer ordering/fulfillment validated safely | Quote/payment/fulfillment and historical-snapshot test evidence in approved test scope |
| Store review | Store record, listing, privacy/review requirements and chosen binary complete | Verified submission prerequisites; external requirements assessed against the actual app record |
| Store review | Correct binary submitted and Apple approval confirmed | Recorded submission and external approval evidence |
| Ready for release | Approved release remains unpublished under manual release control | Verified external held-release state, not merely successful EAS upload |
| Publication request | Owner requests Go live for that release | Persisted authenticated release-specific authorization |
| Publication request | Nomly receives the request | Durable request/event and tracked retryable notification |
| Publication | Nomly publishes the authorized release | Recorded publication action for the approved binary |
| Publication | App Store publication confirmed | Verified external published state/store availability; only then show Live |
| Post-publication | Runtime access/ordering gates and app behavior verified | Separately recorded operational activation and smoke-test results |

Every applicable check must have a clear responsible party, authoritative source,
scope, blocker stage, evidence/time, and actionable failure reason. Optional
checks may be marked not applicable only with a reason, never silently skipped.
There is no blanket "everything ready" flag that overrides missing evidence.

Expose this as a staged Nomly checklist with missing requirements, while showing
owners only their actionable steps and concise progress. Owner onboarding should
remain short when Nomly has already supplied all configuration. Menu/QA and
Nomly's technical work must not block owner handoff merely because later stages
are unfinished.

### Owner submission

Validate authoritative persisted owner data, active ownership, authorized scope,
payment evidence under the approved policy, and team completion/skip. Return
specific missing requirements. Do not depend on Nomly credentials or a completed
binary. Accept legitimate persisted defaults and earlier collected data. Do not
require branding uploads, a populated menu, or explicit pickup-instruction entry.
Record submission and its handoff event atomically where possible.

### Build readiness

Validate the app profile and a complete environment-specific manifest, including
brand/location targets, native identity, EAS project, API target, usable asset
files, Apple Pay configuration, versions, monitoring, and access to the approved
build infrastructure. Existing registered identities must be imported and
preserved. Nomly's earlier branding intake and owner UI/UX approval must be
recorded against the proposed app/release. Snapshot configuration and source
commit for each build. UI/UX approval is separate from later permission to publish.

### Publication readiness and owner authorization

Require actual Apple approval of the chosen submitted release, prior owner UI/UX
approval, and confirmed held/manual-publication state before exposing Go live.
Persist owner, brand, release/build identity, timestamp, and request identity.
Notify Nomly through retryable delivery. Repeated clicks cannot create multiple
publication requests. Notify failure cannot lose the recorded authorization.

Go live is not an EAS build approval, an EAS upload, App Store review submission,
or customer ordering activation. These must have distinct actions/evidence.
Publication must not occur automatically on store approval. Nomly must use a
release configuration that preserves manual publication until the owner's Go
live request;
verify this operationally before claiming the gate is enforced.

Authorization must not silently carry onto a different binary. Material changes
after authorization need release-specific invalidation/reapproval rules. Normal
runtime edits do not automatically require a new binary; define that boundary
using the actual build manifest/runtime dependencies.

## Verified implementation gaps

| Area | Current evidence | Required change |
| --- | --- | --- |
| Email | `services/identity/src/email.ts`: plain text Resend email; console default | Branded CTA, operational provider verification, durable retry/status |
| Activation | `services/identity/src/invites.ts`: password activation; token consumed before account update | Atomic activation and secure passwordless invitation binding/recovery |
| First-time completion | `services/catalog/src/owner-setup.ts`: basics only | Approved owner-requirements gate; do not equate old completion with submission |
| Defaultable fields | Local completion requires nonempty pickup instructions | Persist a default; no required owner onboarding input |
| Location flow | Current local wizard operates on one location scope at a time | Dynamic one/many-location progress and submission coverage |
| Assets/menu | Current app/readiness checks include assets conditionally and menu before review | Keep Nomly asset preparation and post-onboarding menu outside owner completion |
| Review state | Catalog repository derives `ready_for_review` from readiness or submission | Distinguish eligibility from an explicit owner handoff |
| Nomly queue | Admin Console launch-readiness page mixes several launch checks | Separate submitted, build-ready, and release-ready views and reliable notification |
| Build inputs | Worker merchant payload omits native/project/asset-path inputs required by preparation script | One complete validated manifest assembly path |
| Publication | Current EAS command uploads a recorded build; no proven owner-publication gate | Release-specific request, Nomly publication action, confirmed publication state |
| Runtime launch | `mobile-brand-bootstrap.ts` gates customer access separately | Preserve safety; decide operational sequencing without redefining Go live |

Evidence paths are relative to the repository. Supporting files:
`packages/contracts/catalog/src/index.ts`,
`apps/client-dashboard/src/features/invites/`,
`apps/client-dashboard/src/features/onboarding/`,
`services/workers/mobile-release/src/index.ts`,
`apps/mobile/scripts/prepare-merchant-build.mjs`,
`apps/mobile/scripts/validate-release-env.mjs`, `apps/mobile/eas.json`,
and `apps/admin-console/src/app/(console)/launch-readiness/page.tsx`.

## Data and compatibility rules

- One authoritative write home per field; aggregate projections must not become
  independent writable copies of provider/runtime/release state.
- No tenant/brand identity consolidation or giant JSON rewrite in these slices.
  Establish business scope before changing identity or storage boundaries.
- Preserve existing accounts, issued invitations, location authorization,
  payment state, registered native identifiers, mobile clients, and build history.
- Existing brands must not be forced back through first-time onboarding. A
  grandfathered completion marker is not proof of complete build inputs or owner
  publication authorization; evaluate those gates independently.
- Additive migration/compatibility strategy must precede each persistence change.
- Callback redirects must resume saved onboarding safely without exposing tokens.
- Submission/launch authorization must be auditable, idempotent, and protected
  against stale session, location, and release responses.

## Implementation slices and acceptance

0. Finalize field ownership/requiredness/editability and auth rollout policy.
1. Invitation delivery and activation reliability: branded email, retryable
   delivery, atomic token/account operation, auth binding, expiration/resend and
   account recovery. Do not advertise unsupported activation methods.
2. Complete minimal resumable onboarding: authoritative provisioned location set,
   legitimate defaults, necessary missing owner information, Stripe return/refresh,
   optional Team, submission gate excluding branding/menu, Settings-only later
   correction and later-location configuration.
3. Nomly handoff: durable submission event, actionable queue, retryable
   notification, no duplicate event on retry, no build-ready inference from email.
4. Complete manifest and manual build handoff: Nomly-collected assets, recorded
   owner UI/UX approval, project prerequisites, environment isolation, immutable
   snapshot, approved build/submission records and tracked Apple review.
5. Owner publication request: Apple-approved held release, release-bound
   authorization, no forced launch timing, durable notification, internal manual
   publication and confirmation.
6. End-to-end disposable-client verification before rollout. Build automation
   beyond the supported manual process follows separately, not as a prerequisite.

Test failure/retry at every boundary. Specifically prove wrong-user invite
rejection, private-relay/account binding behavior, expired/consumed invitation
handling, interrupted provider callbacks, failed completion without false success,
single-flight submission, notification recovery, stale-scope isolation, asset
failure, beta/production separation, and no unauthorized publication. Store
publication checks require approved sandbox/operational evidence; unit tests alone
cannot prove App Store release settings. Never test this with production writes.

Also test one versus multiple provisioned locations, partial location completion,
scope changes during save, default pickup instructions without an input, owner
submission with no menu or branding uploads, and owner-delayed publication after
Apple approval. Missing Nomly assets must block the correct internal gate rather
than trapping the owner in onboarding.

## First implementation slice: prerequisites

Start with invitation/activation after deciding which passwordless methods ship
first and how recipient proof works for a provider using a different/relay email.
Do not automatically link identities on email text alone. Passkey enrollment
requires a securely established invited identity, not an unverified account ID.

Retain current sign-in for existing owners during transition; do not silently
remove password access or deploy all three desired providers unverified. Exact
contracts and migration design follow the approved auth policy and focused code
audit. No backend/UI implementation is included in this specification change.
