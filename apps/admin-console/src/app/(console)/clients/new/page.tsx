import Link from "next/link";
import { createClientAction } from "@/app/actions";

type NewClientPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewClientPage({ searchParams }: NewClientPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">New Client</span>
          <h3>Create a client</h3>
          <p>Set up the location, launch capabilities, and owner access in one flow.</p>
        </div>
        <Link href="/clients" className="secondary-button">
          Back to Clients
        </Link>
      </div>

      <form action={createClientAction} className="split-layout split-layout--wide">
        <section className="panel stack-form">
          <div className="wizard-steps" aria-label="Create client steps">
            <div className="wizard-step is-active">
              <span className="wizard-step-index">1</span>
              Client identity
            </div>
            <div className="wizard-step is-active">
              <span className="wizard-step-index">2</span>
              Location
            </div>
            <div className="wizard-step is-active">
              <span className="wizard-step-index">3</span>
              Capabilities
            </div>
            <div className="wizard-step is-active">
              <span className="wizard-step-index">4</span>
              Owner handoff
            </div>
          </div>

          {error ? <p className="inline-message inline-message-error">{error}</p> : null}

          <div className="form-card">
            <div className="section-copy">
              <span className="eyebrow">Step 1</span>
              <h4>Client identity</h4>
              <p>Define the business identity that shows up across the internal console, mobile app configuration, and dashboard handoff. Internal IDs are generated after creation.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Client name</span>
                <input name="clientName" placeholder="Northside Coffee" required />
              </label>
              <label className="field">
                <span>Store display name</span>
                <input name="storeName" placeholder="Northside Coffee" />
              </label>
              <label className="field">
                <span>Market</span>
                <input name="marketLabel" placeholder="Detroit, MI" required />
              </label>
            </div>
          </div>

          <div className="form-card">
            <div className="section-copy">
              <span className="eyebrow">Step 2</span>
              <h4>Location setup</h4>
              <p>Capture the first store, its operational label, and the pickup information the product surfaces will share.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Location name</span>
                <input name="locationName" placeholder="Northside Flagship" required />
              </label>
              <label className="field">
                <span>Hours</span>
                <input name="hours" defaultValue="Daily · 7:00 AM - 6:00 PM" />
              </label>
              <label className="field field-wide">
                <span>Pickup instructions</span>
                <input name="pickupInstructions" defaultValue="Pickup at the espresso counter." />
              </label>
            </div>
          </div>

          <div className="form-card">
            <div className="section-copy">
              <span className="eyebrow">Step 3</span>
              <h4>Capability baseline</h4>
              <p>Choose the operational defaults that determine what the client dashboard and customer app can actually do on day one.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Menu source</span>
                <select name="menuSource" defaultValue="platform_managed">
                  <option value="platform_managed">Platform managed</option>
                  <option value="external_sync">External sync</option>
                </select>
              </label>
              <label className="field">
                <span>Fulfillment mode</span>
                <select name="fulfillmentMode" defaultValue="staff" required>
                  <option value="staff">Staff managed</option>
                  <option value="time_based">Time based (demo only)</option>
                </select>
                <p className="field-hint">Real merchant pilots should use staff managed fulfillment.</p>
                <p className="field-hint is-warning">
                  Time based auto-progresses orders without staff confirmation. Only use it for demos.
                </p>
              </label>
              <label className="field">
                <span>Tax rate (%)</span>
                <input name="taxRatePercent" type="number" step="0.01" min="0" max="100" placeholder="6.00" required />
                <p className="field-hint">Sales tax rate for this location, e.g. 6.5 for 6.5%.</p>
              </label>
              <label className="toggle-field">
                <input type="checkbox" name="dashboardEnabled" defaultChecked />
                <span>Enable client dashboard</span>
              </label>
              <label className="toggle-field">
                <input type="checkbox" name="liveOrderTrackingEnabled" defaultChecked />
                <span>Enable live order tracking</span>
              </label>
              <label className="toggle-field">
                <input type="checkbox" name="loyaltyVisible" defaultChecked />
                <span>Show loyalty in the customer app</span>
              </label>
            </div>
          </div>

          <div className="form-card">
            <div className="section-copy">
              <span className="eyebrow">Step 4</span>
              <h4>Owner access</h4>
              <p>Create the first dashboard owner so the launch handoff does not depend on shell access or ad hoc credential creation.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Owner name</span>
                <input name="ownerDisplayName" placeholder="Owner Name" required />
              </label>
              <label className="field">
                <span>Owner email</span>
                <input name="ownerEmail" type="email" placeholder="owner@northside.com" required />
              </label>
              <label className="field">
                <span>Temporary password</span>
                <input name="temporaryPassword" type="password" placeholder="Leave blank to auto-generate" />
              </label>
              <label className="field">
                <span>Client dashboard URL</span>
                <input name="dashboardUrl" placeholder="https://client.example.com" />
              </label>
            </div>
          </div>

          <div className="form-actions">
            <Link href="/clients" className="secondary-button">
              Cancel
            </Link>
            <button type="submit" className="primary-button">
              Create Client
            </button>
          </div>
        </section>

        <aside className="sidebar-stack sticky-sidebar">
          <section className="panel">
            <div className="section-copy">
              <span className="eyebrow">What This Does</span>
              <h4>Provision the first client lane</h4>
              <p>This flow creates the location record, applies the initial capabilities, and provisions the first dashboard owner.</p>
            </div>
            <div className="step-list">
              <div className="step-item">
                <span className="step-item-index">1</span>
                <div className="step-item-copy">
                  <strong>Bootstrap the location</strong>
                  <p>Create the internal location record and generate stable backend identifiers.</p>
                </div>
              </div>
              <div className="step-item">
                <span className="step-item-index">2</span>
                <div className="step-item-copy">
                  <strong>Set launch defaults</strong>
                  <p>Establish dashboard, loyalty, menu source, and fulfillment behavior.</p>
                </div>
              </div>
              <div className="step-item">
                <span className="step-item-index">3</span>
                <div className="step-item-copy">
                  <strong>Create owner access</strong>
                  <p>Issue the first client dashboard credentials without leaving the console.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-copy">
              <span className="eyebrow">Launch Baseline</span>
              <h4>Recommended defaults</h4>
            </div>
            <div className="tag-list">
              <span className="tag is-success">Platform-managed menu</span>
              <span className="tag is-success">Client dashboard enabled</span>
              <span className="tag is-success">Live tracking enabled</span>
              <span className="tag">Loyalty visible</span>
            </div>
            <div className="callout is-warning">
              <strong>External menu sync changes the handoff</strong>
              <p>If the menu source is external, dashboard menu editing stays limited until the integration is switched back to platform managed.</p>
            </div>
          </section>
        </aside>
      </form>
    </section>
  );
}
