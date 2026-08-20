import { createHash } from "node:crypto";
import Link from "next/link";
import type {
  AppIdentityProfile,
  LaunchReadinessResponse,
  MobileReleaseBuildJob,
  MobileReleaseProfile,
  MobileReleaseStatus,
  OnboardingSummary
} from "@lattelink/contracts-catalog";
import { notFound } from "next/navigation";
import {
  approveLaunchAction,
  approveMobileReleaseBuildJobAction,
  prepareMobileReleaseBuildAction,
  startMobileReleaseBuildJobAction,
  updateAppIdentityAction,
  updateMobileReleaseAction
} from "@/app/actions";
import { LaunchReadinessChecklist } from "@/components/LaunchReadinessChecklist";
import {
  getInternalLocation,
  listInternalLocationMobileReleaseBuildJobs,
  getInternalLocationOnboarding,
  getInternalLocationOwner,
  getInternalLocationReadiness,
  InternalApiError
} from "@/lib/internal-api";

type ClientDetailPageProps = {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const mobileReleaseStatusOptions: Array<{ value: MobileReleaseStatus; label: string }> = [
  { value: "not_started", label: "Release profile pending" },
  { value: "metadata_pending", label: "Apple identifiers pending" },
  { value: "metadata_ready", label: "App metadata configured" },
  { value: "build_configuring", label: "Build queued" },
  { value: "build_ready", label: "Build uploaded to TestFlight" },
  { value: "submitted_for_review", label: "Submitted for App Store review" },
  { value: "approved", label: "Approved" },
  { value: "ready_for_launch", label: "Ready for launch" },
  { value: "live", label: "Live" },
  { value: "blocked", label: "Blocked" }
];

function mobileReleaseStatusLabel(status: MobileReleaseStatus | undefined, statusLabel?: string) {
  return statusLabel ?? mobileReleaseStatusOptions.find((option) => option.value === status)?.label ?? "Release profile pending";
}

function mobileReleaseTone(status: MobileReleaseStatus | undefined) {
  if (status === "live" || status === "ready_for_launch" || status === "approved") return "healthy";
  if (status === "blocked") return "critical";
  return "warning";
}

function mobileReleaseBuildJobTone(status: MobileReleaseBuildJob["status"]) {
  if (status === "succeeded") return "healthy";
  if (status === "failed" || status === "canceled") return "critical";
  return "warning";
}

function toDateTimeLocal(value: string | undefined) {
  return value ? value.slice(0, 16) : "";
}

function renderTimelineDate(label: string, value: string | undefined) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{new Date(value).toLocaleString()}</dd>
    </div>
  );
}

function readCurrentSourceCommitSha() {
  const value = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "";
  return /^[a-f0-9]{40}$/i.test(value) ? value : "";
}

function buildDefaultBuildProfile(identity: AppIdentityProfile | undefined) {
  const bundleIdentifier = identity?.bundleIdentifier;
  if (!bundleIdentifier) return "merchant-ios-production";
  return `ios-${bundleIdentifier.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

function buildMobileReleaseConfigHash(locationId: string, identity: AppIdentityProfile | undefined) {
  if (!identity?.readiness.ready) return "";
  const payload = {
    locationId,
    appName: identity.appName,
    displayName: identity.displayName,
    bundleIdentifier: identity.bundleIdentifier,
    sku: identity.sku,
    primaryCategory: identity.primaryCategory,
    subtitle: identity.subtitle,
    supportUrl: identity.supportUrl,
    privacyPolicyUrl: identity.privacyPolicyUrl,
    marketingUrl: identity.marketingUrl,
    iconAssetUrl: identity.iconAssetUrl,
    splashAssetUrl: identity.splashAssetUrl,
    screenshotAssetUrls: identity.screenshotAssetUrls,
    targetLocationIds: identity.targetLocationIds,
    assetMode: identity.assetMode
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function collectLaunchBlockers(onboarding: OnboardingSummary, readiness: LaunchReadinessResponse) {
  const readinessOwnedOnboardingChecks = new Set(["owner_invited", "owner_activated"]);
  const blockers = new Map<string, string>();
  for (const item of onboarding.checklist) {
    if (!item.passed && item.id !== "admin_launch_approved" && !readinessOwnedOnboardingChecks.has(item.id)) {
      blockers.set(item.id, item.detail ? `${item.label}: ${item.detail}` : item.label);
    }
  }
  for (const check of readiness.checks) {
    if (!check.passed) {
      blockers.set(check.id, check.detail ? `${check.label}: ${check.detail}` : check.label);
    }
  }
  return Array.from(blockers.values());
}

function LaunchApprovalPanel({ locationId, onboarding, readiness }: {
  locationId: string;
  onboarding: OnboardingSummary;
  readiness: LaunchReadinessResponse;
}) {
  const blockers = collectLaunchBlockers(onboarding, readiness);
  const approvalBlocked = blockers.length > 0;
  const approved = onboarding.status === "approved" || onboarding.status === "live";
  const live = onboarding.status === "live";

  return (
    <section className="panel">
      <div className="section-heading">
        <span className="eyebrow">Launch Approval</span>
        <h4>{live ? "App is live" : approved ? "Launch approved" : approvalBlocked ? "Approval blocked" : "Ready for manual approval"}</h4>
      </div>

      {approvalBlocked ? (
        <div className="callout is-warning">
          <strong>Resolve these before approval.</strong>
          <ul className="compact-list">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="callout is-success">
          <strong>All launch blockers are clear.</strong>
          <p>Approve only after the manual build, App Store metadata, and release checklist have been reviewed.</p>
        </div>
      )}

      <form action={approveLaunchAction} className="stack-form">
        <input type="hidden" name="locationId" value={locationId} />
        <label className="field">
          <span>Approval note</span>
          <input name="note" defaultValue={onboarding.status === "approved" ? "Ready for live release." : ""} />
        </label>
        <div className="form-actions">
          <button
            type="submit"
            name="launchAction"
            value="approve"
            className="primary-button"
            disabled={approvalBlocked || approved}
            aria-disabled={approvalBlocked || approved}
          >
            Approve Launch
          </button>
          <button
            type="submit"
            name="launchAction"
            value="live"
            className="secondary-button"
            disabled={approvalBlocked || !approved || live}
            aria-disabled={approvalBlocked || !approved || live}
          >
            Mark Live
          </button>
        </div>
      </form>
    </section>
  );
}

function MobileReleaseStatusPanel({
  locationId,
  release,
  identity,
  buildJobs
}: {
  locationId: string;
  release?: MobileReleaseProfile;
  identity?: AppIdentityProfile;
  buildJobs: MobileReleaseBuildJob[];
}) {
  const status = release?.status ?? "not_started";
  const statusLabel = mobileReleaseStatusLabel(status, release?.statusLabel);
  const identityReady = identity?.readiness.ready === true;
  const sourceCommitSha = release?.sourceCommitSha ?? readCurrentSourceCommitSha();
  const configHash = release?.configHash ?? buildMobileReleaseConfigHash(locationId, identity);
  const buildProfile = release?.buildProfile ?? buildDefaultBuildProfile(identity);
  const buildJobReady = Boolean(release?.buildProfile && release.sourceCommitSha && release.configHash);
  const defaultReviewNotes =
    release?.appStoreReviewNotes ??
    `Merchant app build prepared for ${identity?.appName ?? locationId}. Backend content and layout updates are delivered through Nomly without requiring a native binary rebuild.`;

  return (
    <section className="panel">
      <div className="section-heading">
        <span className="eyebrow">Mobile Release</span>
        <h4>Client-visible progress</h4>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`status-badge is-${mobileReleaseTone(status)}`}>{statusLabel}</span>
          </dd>
        </div>
        <div>
          <dt>Build</dt>
          <dd>{release?.buildNumber ?? "Not assigned"}</dd>
        </div>
        <div>
          <dt>Build profile</dt>
          <dd>{release?.buildProfile ?? "Not prepared"}</dd>
        </div>
        <div>
          <dt>Source commit</dt>
          <dd>{release?.sourceCommitSha ? <code>{release.sourceCommitSha.slice(0, 12)}</code> : "Not recorded"}</dd>
        </div>
        <div>
          <dt>Config hash</dt>
          <dd>{release?.configHash ? <code>{release.configHash.slice(0, 16)}</code> : "Not recorded"}</dd>
        </div>
        {renderTimelineDate("Submitted", release?.submittedAt)}
        {renderTimelineDate("Approved", release?.approvedAt)}
        {renderTimelineDate("Live", release?.liveAt)}
        <div>
          <dt>TestFlight</dt>
          <dd>{release?.testFlightUrl ? <a href={release.testFlightUrl}>{release.testFlightUrl}</a> : "Not added"}</dd>
        </div>
        <div>
          <dt>App Store</dt>
          <dd>{release?.appStoreUrl ? <a href={release.appStoreUrl}>{release.appStoreUrl}</a> : "Not added"}</dd>
        </div>
        {release?.blockedReason ? (
          <div>
            <dt>Blocker</dt>
            <dd>{release.blockedReason}</dd>
          </div>
        ) : null}
      </dl>

      {identityReady ? (
        <form action={prepareMobileReleaseBuildAction} className="callout build-prep-panel">
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="buildProfile" value={buildProfile} />
          <input type="hidden" name="configHash" value={configHash} />
          <input type="hidden" name="appStoreReviewNotes" value={defaultReviewNotes} />
          <div>
            <strong>Prepare merchant build</strong>
            <p>
              Records the current identity profile as the native build input. Layout and content publishes remain server-driven and should not require a new binary.
            </p>
          </div>
          <label className="field">
            <span>Source commit SHA</span>
            <input
              name="sourceCommitSha"
              defaultValue={sourceCommitSha}
              placeholder="40-character git commit SHA"
              pattern="[A-Fa-f0-9]{40}"
              required
            />
          </label>
          <label className="field field-wide">
            <span>Internal handoff note</span>
            <input name="notes" defaultValue={release?.notes ?? `Prepared build config ${configHash.slice(0, 12)}.`} />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={!configHash}>
              Prepare Build
            </button>
          </div>
        </form>
      ) : (
        <div className="callout is-warning">
          <strong>Build preparation is blocked.</strong>
          <p>Complete the app identity profile before recording a native build configuration.</p>
        </div>
      )}

      <div className="callout build-prep-panel">
        <div>
          <strong>Start build job</strong>
          <p>
            Creates the tracked build request that the mobile release runner will pick up. Use this only after the prepared build metadata matches the intended commit and app identity.
          </p>
        </div>
        <form action={startMobileReleaseBuildJobAction} className="stack-form">
          <input type="hidden" name="locationId" value={locationId} />
          <input type="hidden" name="buildProfile" value={release?.buildProfile ?? ""} />
          <input type="hidden" name="sourceCommitSha" value={release?.sourceCommitSha ?? ""} />
          <input type="hidden" name="configHash" value={release?.configHash ?? ""} />
          <input type="hidden" name="appStoreReviewNotes" value={release?.appStoreReviewNotes ?? defaultReviewNotes} />
          <input type="hidden" name="requestedBy" value="admin-console" />
          <label className="field">
            <span>Target lane</span>
            <select name="profile" defaultValue="beta">
              <option value="beta">Beta / TestFlight</option>
              <option value="production">Production / App Store</option>
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={!buildJobReady}>
              Start Build Job
            </button>
          </div>
          {!buildJobReady ? (
            <p className="field-hint">Prepare the build metadata before creating a tracked job.</p>
          ) : null}
        </form>
      </div>

      <div className="build-job-list">
        <div className="section-heading">
          <span className="eyebrow">Build Jobs</span>
          <h4>Recent requests</h4>
        </div>
        {buildJobs.length === 0 ? (
          <p className="subtle-copy">No mobile build jobs have been started for this location yet.</p>
        ) : (
          <div className="mini-list">
            {buildJobs.map((job) => (
              <div key={job.jobId} className="mini-list-item">
                <div className="mini-list-copy">
                  <strong>
                    {job.profile === "production" ? "Production" : "Beta"} build
                    <span className={`status-badge is-${mobileReleaseBuildJobTone(job.status)}`}>{job.status}</span>
                  </strong>
                  <p>
                    <code>{job.sourceCommitSha.slice(0, 12)}</code> · config <code>{job.configHash.slice(0, 12)}</code> · {new Date(job.createdAt).toLocaleString()}
                  </p>
                  {job.easBuildId ? <p>EAS build: {job.easBuildId}</p> : null}
                  {job.easSubmissionId ? <p>EAS submit: {job.easSubmissionId}</p> : null}
                  {job.errorMessage ? <p>{job.errorMessage}</p> : null}
                  {job.status === "awaiting_approval" ? (
                    <form action={approveMobileReleaseBuildJobAction}>
                      <input type="hidden" name="locationId" value={locationId} />
                      <input type="hidden" name="jobId" value={job.jobId} />
                      <button type="submit" className="secondary-button">
                        Approve submission
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form action={updateMobileReleaseAction} className="stack-form release-form">
        <input type="hidden" name="locationId" value={locationId} />
        <div className="field-grid">
          <label className="field">
            <span>Status</span>
            <select name="status" defaultValue={status}>
              {mobileReleaseStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Custom client label</span>
            <input name="statusLabel" defaultValue={release?.statusLabel ?? ""} placeholder={statusLabel} />
            <p className="field-hint">Optional override for the text clients see.</p>
          </label>
          <label className="field">
            <span>Build number</span>
            <input name="buildNumber" defaultValue={release?.buildNumber ?? ""} />
          </label>
          <label className="field">
            <span>Build profile</span>
            <input name="buildProfile" defaultValue={release?.buildProfile ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Source commit SHA</span>
            <input name="sourceCommitSha" defaultValue={release?.sourceCommitSha ?? ""} pattern="[A-Fa-f0-9]{40}" />
          </label>
          <label className="field field-wide">
            <span>Config hash</span>
            <input name="configHash" defaultValue={release?.configHash ?? ""} />
          </label>
          <label className="field">
            <span>Submitted at</span>
            <input name="submittedAt" type="datetime-local" defaultValue={toDateTimeLocal(release?.submittedAt)} />
          </label>
          <label className="field">
            <span>Approved at</span>
            <input name="approvedAt" type="datetime-local" defaultValue={toDateTimeLocal(release?.approvedAt)} />
          </label>
          <label className="field">
            <span>Live at</span>
            <input name="liveAt" type="datetime-local" defaultValue={toDateTimeLocal(release?.liveAt)} />
          </label>
          <label className="field field-wide">
            <span>TestFlight URL</span>
            <input name="testFlightUrl" type="url" defaultValue={release?.testFlightUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>App Store URL</span>
            <input name="appStoreUrl" type="url" defaultValue={release?.appStoreUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Blocked reason</span>
            <input name="blockedReason" defaultValue={release?.blockedReason ?? ""} />
          </label>
          <label className="field field-wide">
            <span>App Store review notes</span>
            <textarea name="appStoreReviewNotes" rows={4} defaultValue={release?.appStoreReviewNotes ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Internal notes</span>
            <input name="notes" defaultValue={release?.notes ?? ""} />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Update Release Status
          </button>
        </div>
      </form>
    </section>
  );
}

function AppIdentityPanel({ locationId, identity }: { locationId: string; identity?: AppIdentityProfile }) {
  const readiness = identity?.readiness;
  const ready = readiness?.ready === true;

  return (
    <section className="panel">
      <div className="section-heading">
        <span className="eyebrow">App Identity</span>
        <h4>Submission metadata</h4>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`status-badge is-${ready ? "healthy" : "warning"}`}>
              {ready ? "Ready" : "Missing metadata"}
            </span>
          </dd>
        </div>
        <div>
          <dt>Bundle ID</dt>
          <dd>{identity?.bundleIdentifier ?? "Not configured"}</dd>
        </div>
        <div>
          <dt>Assets</dt>
          <dd>{identity?.assetMode === "provided" ? "Provided assets required" : "Nomly placeholder assets"}</dd>
        </div>
        {!ready && readiness?.missingRequiredFields.length ? (
          <div>
            <dt>Missing</dt>
            <dd>{readiness.missingRequiredFields.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      <form action={updateAppIdentityAction} className="stack-form release-form">
        <input type="hidden" name="locationId" value={locationId} />
        <div className="field-grid">
          <label className="field">
            <span>App name</span>
            <input name="appName" maxLength={30} defaultValue={identity?.appName ?? ""} />
          </label>
          <label className="field">
            <span>Home screen name</span>
            <input name="displayName" maxLength={30} defaultValue={identity?.displayName ?? ""} />
          </label>
          <label className="field">
            <span>Bundle identifier</span>
            <input name="bundleIdentifier" defaultValue={identity?.bundleIdentifier ?? ""} placeholder="us.nomly.brand" />
          </label>
          <label className="field">
            <span>SKU</span>
            <input name="sku" defaultValue={identity?.sku ?? ""} />
          </label>
          <label className="field">
            <span>Primary category</span>
            <input name="primaryCategory" defaultValue={identity?.primaryCategory ?? "Food & Drink"} />
          </label>
          <label className="field">
            <span>Subtitle</span>
            <input name="subtitle" maxLength={30} defaultValue={identity?.subtitle ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Description</span>
            <textarea name="description" rows={4} defaultValue={identity?.description ?? ""} />
          </label>
          <label className="field">
            <span>Keywords</span>
            <input name="keywords" defaultValue={identity?.keywords.join(", ") ?? ""} />
          </label>
          <label className="field">
            <span>Asset mode</span>
            <select name="assetMode" defaultValue={identity?.assetMode ?? "placeholder"}>
              <option value="placeholder">Nomly placeholder assets</option>
              <option value="provided">Provided brand assets</option>
            </select>
          </label>
          <label className="field field-wide">
            <span>Support URL</span>
            <input name="supportUrl" type="url" defaultValue={identity?.supportUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Privacy policy URL</span>
            <input name="privacyPolicyUrl" type="url" defaultValue={identity?.privacyPolicyUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Marketing URL</span>
            <input name="marketingUrl" type="url" defaultValue={identity?.marketingUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Icon asset URL</span>
            <input name="iconAssetUrl" type="url" defaultValue={identity?.iconAssetUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Splash asset URL</span>
            <input name="splashAssetUrl" type="url" defaultValue={identity?.splashAssetUrl ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Screenshot URLs</span>
            <textarea name="screenshotAssetUrls" rows={3} defaultValue={identity?.screenshotAssetUrls.join("\n") ?? ""} />
          </label>
          <label className="field field-wide">
            <span>Target location IDs</span>
            <input name="targetLocationIds" defaultValue={identity?.targetLocationIds.join(", ") ?? locationId} />
          </label>
          <label className="field">
            <span>Admin override ready</span>
            <input name="adminOverrideReady" type="checkbox" defaultChecked={identity?.adminOverrideReady === true} />
          </label>
          <label className="field field-wide">
            <span>Override reason</span>
            <input name="adminOverrideReason" defaultValue={identity?.adminOverrideReason ?? ""} />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="primary-button">
            Update App Identity
          </button>
        </div>
      </form>
    </section>
  );
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const { locationId } = await params;
  const query = await searchParams;
  const created = typeof query.created === "string" ? query.created : undefined;
  const invited = typeof query.invited === "string" ? query.invited : undefined;
  const releaseUpdated = typeof query.releaseUpdated === "string" ? query.releaseUpdated : undefined;
  const releasePrepared = typeof query.releasePrepared === "string" ? query.releasePrepared : undefined;
  const releaseBuildQueued = typeof query.releaseBuildQueued === "string" ? query.releaseBuildQueued : undefined;
  const releaseError = typeof query.releaseError === "string" ? query.releaseError : undefined;
  const appIdentityUpdated = typeof query.appIdentityUpdated === "string" ? query.appIdentityUpdated : undefined;
  const appIdentityError = typeof query.appIdentityError === "string" ? query.appIdentityError : undefined;
  const launchApproved = typeof query.launchApproved === "string" ? query.launchApproved : undefined;
  const launchLive = typeof query.launchLive === "string" ? query.launchLive : undefined;
  const launchError = typeof query.launchError === "string" ? query.launchError : undefined;

  try {
    const [location, ownerSummary, launchReadiness, onboarding, buildJobsResponse] = await Promise.all([
      getInternalLocation(locationId),
      getInternalLocationOwner(locationId),
      getInternalLocationReadiness(locationId),
      getInternalLocationOnboarding(locationId),
      listInternalLocationMobileReleaseBuildJobs(locationId)
    ]);

    const hasOwner = Boolean(ownerSummary.owner);
    const issues = [
      !location.capabilities.operations.dashboardEnabled,
      !hasOwner,
      !location.capabilities.operations.liveOrderTrackingEnabled
    ].filter(Boolean).length;

    const launchState = issues === 0 ? "healthy" : issues === 1 ? "warning" : "critical";
    const launchLabel = launchState === "healthy" ? "Launch ready" : launchState === "warning" ? "Needs attention" : "Blocked";

    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <span className="eyebrow">{location.marketLabel}</span>
            <h3>{location.brandName}</h3>
            <p>{location.locationName}</p>
          </div>
          <div className="page-tools">
            <span className={`status-badge is-${launchState}`}>{launchLabel}</span>
            <Link href={`/clients/${locationId}/capabilities`} className="secondary-button">
              Edit Capabilities
            </Link>
            <Link href={`/clients/${locationId}/owner`} className="primary-button">
              Manage Owner
            </Link>
          </div>
        </div>

        {created ? <p className="inline-message inline-message-success">Client shell created.</p> : null}
        {invited ? <p className="inline-message inline-message-success">Owner invite sent.</p> : null}
        {releasePrepared ? <p className="inline-message inline-message-success">Mobile build configuration prepared.</p> : null}
        {releaseBuildQueued ? <p className="inline-message inline-message-success">Mobile build job queued.</p> : null}
        {releaseUpdated ? <p className="inline-message inline-message-success">Mobile release status updated.</p> : null}
        {releaseError ? <p className="inline-message inline-message-error">{releaseError}</p> : null}
        {appIdentityUpdated ? <p className="inline-message inline-message-success">App identity updated.</p> : null}
        {appIdentityError ? <p className="inline-message inline-message-error">{appIdentityError}</p> : null}
        {launchApproved ? <p className="inline-message inline-message-success">Launch approved.</p> : null}
        {launchLive ? <p className="inline-message inline-message-success">Launch marked live.</p> : null}
        {launchError ? <p className="inline-message inline-message-error">{launchError}</p> : null}

        <div className="stat-grid">
          <article className="stat-card">
            <span className="eyebrow">Owner Access</span>
            <strong>{ownerSummary.owner ? ownerSummary.owner.displayName : "Missing"}</strong>
            <p>{ownerSummary.owner ? ownerSummary.owner.email : "This location still needs its first dashboard owner."}</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Menu Source</span>
            <strong>{location.capabilities.menu.source === "platform_managed" ? "Platform" : "External"}</strong>
            <p>
              {location.capabilities.menu.source === "platform_managed"
                ? "Menu edits can be driven from the LatteLink dashboard."
                : "Dashboard menu editing is constrained by external sync."}
            </p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Payments</span>
            <strong>{location.paymentReadiness?.ready ? "Ready" : "Needs setup"}</strong>
            <p>
              {location.paymentProfile?.stripeAccountId
                ? `Stripe account ${location.paymentProfile.stripeAccountId}`
                : "No Stripe account linked to this location yet."}
            </p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Fulfillment</span>
            <strong>{location.capabilities.operations.fulfillmentMode === "staff" ? "Staff" : "Time based"}</strong>
            <p>Operational handoff should match the configured store fulfillment model.</p>
          </article>
        </div>

        <div className="detail-grid">
          <section className="panel">
            <div className="section-heading">
              <span className="eyebrow">Business</span>
              <h4>Client summary</h4>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Store name</dt>
                <dd>{location.storeName}</dd>
              </div>
              <div>
                <dt>Hours</dt>
                <dd>{location.hours}</dd>
              </div>
              <div>
                <dt>Pickup</dt>
                <dd>{location.pickupInstructions}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="section-heading">
              <span className="eyebrow">Operations</span>
              <h4>Capability overview</h4>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Dashboard access</dt>
                <dd>{location.capabilities.operations.dashboardEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt>Live order tracking</dt>
                <dd>{location.capabilities.operations.liveOrderTrackingEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt>Menu source</dt>
                <dd>{location.capabilities.menu.source === "platform_managed" ? "Platform managed" : "External sync"}</dd>
              </div>
              <div>
                <dt>Fulfillment mode</dt>
                <dd>{location.capabilities.operations.fulfillmentMode === "staff" ? "Staff managed" : "Time based"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="panel">
          <div className="section-heading">
            <span className="eyebrow">Technical Details</span>
            <h4>Generated identifiers</h4>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Brand ID</dt>
              <dd>{location.brandId}</dd>
            </div>
            <div>
              <dt>Location ID</dt>
              <dd>{location.locationId}</dd>
            </div>
          </dl>
        </section>

        <div className="detail-grid">
          <section className="panel">
            <div className="section-heading">
              <span className="eyebrow">Owner</span>
              <h4>Handoff summary</h4>
            </div>
            {ownerSummary.owner ? (
              <dl className="detail-list">
                <div>
                  <dt>Name</dt>
                  <dd>{ownerSummary.owner.displayName}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{ownerSummary.owner.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{ownerSummary.owner.role}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{ownerSummary.owner.active ? "Active" : "Inactive"}</dd>
                </div>
              </dl>
            ) : (
              <p className="inline-message inline-message-warning">
                No owner is assigned to this location yet. Use the owner screen before the dashboard handoff.
              </p>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <span className="eyebrow">Actions</span>
              <h4>Next steps</h4>
            </div>
            <div className="quick-grid">
              <Link href={`/clients/${locationId}/capabilities`} className="action-card">
                <strong>Edit capabilities</strong>
                <p className="subtle-copy">Adjust dashboard access, fulfillment mode, menu source, and loyalty visibility.</p>
              </Link>
              <Link href={`/clients/${locationId}/owner`} className="action-card">
                <strong>Provision owner</strong>
                <p className="subtle-copy">Create or rotate the first client dashboard account for this location.</p>
              </Link>
              <Link href={`/clients/${locationId}/payments`} className="action-card">
                <strong>Manage payments</strong>
                <p className="subtle-copy">Create Stripe onboarding links, confirm readiness, and open Express.</p>
              </Link>
              <Link href="/launch-readiness" className="action-card">
                <strong>Open readiness board</strong>
                <p className="subtle-copy">Compare this location against the rest of the launch pipeline from one view.</p>
              </Link>
            </div>
          </section>
        </div>

        <section className="panel">
          <LaunchReadinessChecklist readiness={launchReadiness} />
        </section>

        <LaunchApprovalPanel locationId={locationId} onboarding={onboarding} readiness={launchReadiness} />

        <AppIdentityPanel locationId={locationId} identity={onboarding.appIdentity} />

        <MobileReleaseStatusPanel
          locationId={locationId}
          release={onboarding.mobileRelease}
          identity={onboarding.appIdentity}
          buildJobs={buildJobsResponse.jobs}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof InternalApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
