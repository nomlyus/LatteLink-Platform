import Link from "next/link";
import { notFound } from "next/navigation";
import { updateClientCapabilitiesAction } from "@/app/actions";
import { getInternalLocation, InternalApiError } from "@/lib/internal-api";

type ClientCapabilitiesPageProps = {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientCapabilitiesPage({ params, searchParams }: ClientCapabilitiesPageProps) {
  const { locationId } = await params;
  const query = await searchParams;
  const updated = typeof query.updated === "string" ? query.updated : undefined;
  const error = typeof query.error === "string" ? query.error : undefined;

  try {
    const location = await getInternalLocation(locationId);
    const launchIssues = [
      !location.capabilities.operations.dashboardEnabled,
      !location.capabilities.operations.liveOrderTrackingEnabled
    ].filter(Boolean).length;
    const launchState = launchIssues === 0 ? "healthy" : "warning";

    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <span className="eyebrow">Capabilities</span>
            <h3>{location.brandName}</h3>
            <p>Update the pilot behavior from the same internal bootstrap surface used during onboarding.</p>
          </div>
          <div className="page-tools">
            <span className={`status-badge is-${launchState}`}>
              {launchState === "healthy" ? "Launch baseline ready" : "Review before handoff"}
            </span>
            <Link href={`/clients/${locationId}`} className="secondary-button">
              Back to Client
            </Link>
          </div>
        </div>

        <div className="stat-grid">
          <article className="stat-card">
            <span className="eyebrow">Menu Source</span>
            <strong>{location.capabilities.menu.source === "platform_managed" ? "Platform" : "External"}</strong>
            <p>Determines whether the dashboard can own menu editing for this client.</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Dashboard</span>
            <strong>{location.capabilities.operations.dashboardEnabled ? "Enabled" : "Disabled"}</strong>
            <p>Controls whether the store can actively use the client dashboard.</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Live Tracking</span>
            <strong>{location.capabilities.operations.liveOrderTrackingEnabled ? "Enabled" : "Disabled"}</strong>
            <p>Sets whether order-state updates are visible in the launch experience.</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Loyalty</span>
            <strong>{location.capabilities.loyalty.visible ? "Visible" : "Hidden"}</strong>
            <p>Defines whether loyalty shows up to customers in the app.</p>
          </article>
        </div>

        <div className="split-layout">
          <section className="panel stack-form">
            {updated ? <p className="inline-message inline-message-success">Capabilities updated.</p> : null}
            {error ? <p className="inline-message inline-message-error">{error}</p> : null}

            <form action={updateClientCapabilitiesAction} className="stack-form">
              <input type="hidden" name="locationId" value={location.locationId} />

              <div className="form-card">
                <div className="section-copy">
                  <span className="eyebrow">Operations</span>
                  <h4>Launch-critical switches</h4>
                  <p>These controls decide whether operators can use the dashboard, how orders progress, and whether menu management belongs to LatteLink or an external source.</p>
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>Menu source</span>
                    <select name="menuSource" defaultValue={location.capabilities.menu.source}>
                      <option value="platform_managed">Platform managed</option>
                      <option value="external_sync">External sync</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Fulfillment mode</span>
                    <select name="fulfillmentMode" defaultValue={location.capabilities.operations.fulfillmentMode} required>
                      <option value="staff">Staff managed</option>
                      <option value="time_based">Time based (demo only)</option>
                    </select>
                    <p className="field-hint">Real merchant pilots should use staff managed fulfillment.</p>
                    <p className="field-hint is-warning">
                      Time based auto-progresses orders without staff confirmation. Only use it for demos.
                    </p>
                  </label>
                  <label className="toggle-field">
                    <input type="checkbox" name="dashboardEnabled" defaultChecked={location.capabilities.operations.dashboardEnabled} />
                    <span>Client dashboard enabled</span>
                  </label>
                  <label className="toggle-field">
                    <input
                      type="checkbox"
                      name="liveOrderTrackingEnabled"
                      defaultChecked={location.capabilities.operations.liveOrderTrackingEnabled}
                    />
                    <span>Live order tracking enabled</span>
                  </label>
                </div>
              </div>

              <div className="form-card">
                <div className="section-copy">
                  <span className="eyebrow">Customer Experience</span>
                  <h4>Loyalty visibility</h4>
                  <p>Keep customer-facing capabilities aligned with the launch promise and the current client plan.</p>
                </div>
                <div className="field-grid">
                  <label className="toggle-field">
                    <input type="checkbox" name="loyaltyVisible" defaultChecked={location.capabilities.loyalty.visible} />
                    <span>Loyalty visible in customer app</span>
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <Link href={`/clients/${locationId}`} className="secondary-button">
                  Cancel
                </Link>
                <button type="submit" className="primary-button">
                  Save Capabilities
                </button>
              </div>
            </form>
          </section>

          <aside className="sidebar-stack sticky-sidebar">
            <section className="panel">
              <div className="section-copy">
                <span className="eyebrow">Current impact</span>
                <h4>What these settings change</h4>
              </div>
              <div className="mini-list">
                <div className="mini-list-item">
                  <span className="step-item-index">1</span>
                  <div className="mini-list-copy">
                    <strong>Menu ownership</strong>
                    <p>External sync reduces dashboard editing to source-aware visibility and review.</p>
                  </div>
                </div>
                <div className="mini-list-item">
                  <span className="step-item-index">2</span>
                  <div className="mini-list-copy">
                    <strong>Operator workflow</strong>
                    <p>Fulfillment mode changes whether staff explicitly progress orders or rely on time-based flow.</p>
                  </div>
                </div>
                <div className="mini-list-item">
                  <span className="step-item-index">3</span>
                  <div className="mini-list-copy">
                    <strong>Customer visibility</strong>
                    <p>Loyalty and live tracking directly affect the launch experience seen in the client app.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="section-copy">
                <span className="eyebrow">Notes</span>
                <h4>Before you save</h4>
              </div>
              <div className={location.capabilities.menu.source === "external_sync" ? "callout is-warning" : "callout is-success"}>
                <strong>
                  {location.capabilities.menu.source === "external_sync"
                    ? "This location is already external-menu aware"
                    : "This location is currently platform managed"}
                </strong>
                <p>
                  {location.capabilities.menu.source === "external_sync"
                    ? "If you leave the menu source external, expect dashboard editing restrictions even after owner handoff."
                    : "Platform-managed mode keeps the dashboard fully editable for the client team after launch."}
                </p>
              </div>
            </section>
          </aside>
        </div>
      </section>
    );
  } catch (error) {
    if (error instanceof InternalApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
