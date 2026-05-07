import Link from "next/link";
import type { LaunchReadinessResponse, MobileReleaseProfile, MobileReleaseStatus, OnboardingSummary } from "@lattelink/contracts-catalog";
import { notFound } from "next/navigation";
import { approveLaunchAction, updateMobileReleaseAction } from "@/app/actions";
import { LaunchReadinessChecklist } from "@/components/LaunchReadinessChecklist";
import {
  getInternalLocation,
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

function MobileReleaseStatusPanel({ locationId, release }: { locationId: string; release?: MobileReleaseProfile }) {
  const status = release?.status ?? "not_started";
  const statusLabel = mobileReleaseStatusLabel(status, release?.statusLabel);

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

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const { locationId } = await params;
  const query = await searchParams;
  const created = typeof query.created === "string" ? query.created : undefined;
  const invited = typeof query.invited === "string" ? query.invited : undefined;
  const releaseUpdated = typeof query.releaseUpdated === "string" ? query.releaseUpdated : undefined;
  const releaseError = typeof query.releaseError === "string" ? query.releaseError : undefined;
  const launchApproved = typeof query.launchApproved === "string" ? query.launchApproved : undefined;
  const launchLive = typeof query.launchLive === "string" ? query.launchLive : undefined;
  const launchError = typeof query.launchError === "string" ? query.launchError : undefined;

  try {
    const [location, ownerSummary, launchReadiness, onboarding] = await Promise.all([
      getInternalLocation(locationId),
      getInternalLocationOwner(locationId),
      getInternalLocationReadiness(locationId),
      getInternalLocationOnboarding(locationId)
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
        {releaseUpdated ? <p className="inline-message inline-message-success">Mobile release status updated.</p> : null}
        {releaseError ? <p className="inline-message inline-message-error">{releaseError}</p> : null}
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

        <MobileReleaseStatusPanel locationId={locationId} release={onboarding.mobileRelease} />
      </section>
    );
  } catch (error) {
    if (error instanceof InternalApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
