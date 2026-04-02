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
      </div>

      <section className="panel">
        {error ? <p className="inline-message inline-message-error">{error}</p> : null}

        <form action={createClientAction} className="stack-form">
          <div className="form-section">
            <div className="section-heading">
              <span className="eyebrow">Step 1</span>
              <h4>Client Identity</h4>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Client name</span>
                <input name="clientName" placeholder="Northside Coffee" required />
              </label>
              <label className="field">
                <span>Brand slug</span>
                <input name="brandId" placeholder="northside-coffee" />
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

          <div className="form-section">
            <div className="section-heading">
              <span className="eyebrow">Step 2</span>
              <h4>Location</h4>
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Location name</span>
                <input name="locationName" placeholder="Northside Flagship" required />
              </label>
              <label className="field">
                <span>Location ID</span>
                <input name="locationId" placeholder="northside-01" />
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

          <div className="form-section">
            <div className="section-heading">
              <span className="eyebrow">Step 3</span>
              <h4>Capabilities</h4>
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
                <select name="fulfillmentMode" defaultValue="time_based">
                  <option value="time_based">Time based</option>
                  <option value="staff">Staff managed</option>
                </select>
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

          <div className="form-section">
            <div className="section-heading">
              <span className="eyebrow">Step 4</span>
              <h4>Owner Access</h4>
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
            <button type="submit" className="primary-button">
              Create Client
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
