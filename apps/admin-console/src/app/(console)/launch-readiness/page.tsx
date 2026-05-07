import Link from "next/link";
import { getInternalLocationOnboarding, getInternalLocationReadiness, listInternalLocations } from "@/lib/internal-api";

type LaunchState = "healthy" | "warning" | "critical";

function getLaunchState(readiness: { ready: boolean; passedCount: number; totalCount: number }): LaunchState {
  if (readiness.ready) {
    return "healthy";
  }

  return readiness.passedCount >= Math.max(readiness.totalCount - 2, 0) ? "warning" : "critical";
}

export default async function LaunchReadinessPage() {
  const locations = (await listInternalLocations()).locations;
  const readinessRows = await Promise.all(
    locations.map(async (location) => {
      const [readiness, onboarding] = await Promise.all([
        getInternalLocationReadiness(location.locationId),
        getInternalLocationOnboarding(location.locationId)
      ]);
      return {
        location,
        readiness,
        onboarding
      };
    })
  );
  const rows = readinessRows.map(({ location, readiness, onboarding }) => {
    return {
      location,
      readiness,
      onboarding,
      launchState: getLaunchState(readiness)
    };
  });

  const healthyCount = rows.filter((row) => row.launchState === "healthy").length;
  const warningCount = rows.filter((row) => row.launchState === "warning").length;
  const criticalCount = rows.filter((row) => row.launchState === "critical").length;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Launch Readiness</span>
          <h3>Client launch status</h3>
          <p>Use this view to spot missing payment, menu, owner, and operations setup before handoff.</p>
        </div>
        <Link href="/clients/new" className="primary-button">
          Create Client
        </Link>
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <span className="eyebrow">Visible Clients</span>
          <strong>{rows.length}</strong>
          <p>All locations currently under launch review in the internal console.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Ready</span>
          <strong>{healthyCount}</strong>
          <p>Locations passing all automated go-live checks.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Attention</span>
          <strong>{warningCount}</strong>
          <p>Locations that are close to handoff but still missing one launch-critical setting.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Blocked</span>
          <strong>{criticalCount}</strong>
          <p>Locations with multiple missing requirements that need admin follow-up.</p>
        </article>
      </div>

      <section className="panel">
        {rows.length === 0 ? (
          <div className="empty-state">
            <h4>No launch records yet.</h4>
            <p>Create a client before using the readiness board.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                  <th>Readiness</th>
                  <th>Remaining</th>
                  <th>Payment</th>
                  <th>Menu</th>
                  <th>Review</th>
                  <th>Launch State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ location, readiness, onboarding, launchState }) => {
                const remaining = readiness.checks.filter((check) => !check.passed && !check.manual).length;
                const paymentCheck = readiness.checks.find((check) => check.id === "stripe_onboarded");
                const menuCheck = readiness.checks.find((check) => check.id === "menu_has_items");
                const reviewLabel =
                  onboarding.status === "live"
                    ? "Live"
                    : onboarding.status === "approved"
                      ? "Approved"
                      : onboarding.readyForReview || onboarding.submittedForReviewAt
                        ? "Submitted"
                        : "Client setup";

                return (
                <tr key={location.locationId}>
                  <td>
                    <div className="grid-table-meta">
                      <strong>{location.brandName}</strong>
                      <p>
                        {location.locationName} · {location.marketLabel}
                      </p>
                    </div>
                  </td>
                  <td>{readiness.passedCount}/{readiness.totalCount}</td>
                  <td>{remaining === 0 ? "Automated checks passed" : `${remaining} automated gap${remaining === 1 ? "" : "s"}`}</td>
                  <td>{paymentCheck?.passed ? "Ready" : "Needs setup"}</td>
                  <td>{menuCheck?.passed ? "Visible item found" : "No visible items"}</td>
                  <td>{reviewLabel}</td>
                  <td>
                    <span className={`status-badge is-${launchState}`}>
                      {launchState === "healthy" ? "Ready" : launchState === "warning" ? "Attention" : "Blocked"}
                    </span>
                  </td>
                  <td>
                    <Link href={`/clients/${location.locationId}`} className="table-link">
                      Review
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
