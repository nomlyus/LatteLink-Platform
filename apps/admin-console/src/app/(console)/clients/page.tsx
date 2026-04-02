import Link from "next/link";
import { listInternalLocations } from "@/lib/internal-api";

export default async function ClientsPage() {
  const response = await listInternalLocations();
  const locations = response.locations;
  const dashboardEnabledCount = locations.filter((location) => location.capabilities.operations.dashboardEnabled).length;
  const loyaltyVisibleCount = locations.filter((location) => location.capabilities.loyalty.visible).length;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Clients</span>
          <h3>Client locations</h3>
          <p>Every row here comes from the internal location APIs and represents a real client location in the platform.</p>
        </div>
        <Link href="/clients/new" className="primary-button">
          New Client
        </Link>
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <span className="eyebrow">Client Count</span>
          <strong>{locations.length}</strong>
          <p>All client locations currently visible to the control plane.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Dashboard Ready</span>
          <strong>{dashboardEnabledCount}</strong>
          <p>Stores with the client dashboard enabled.</p>
        </article>
        <article className="stat-card">
          <span className="eyebrow">Loyalty Visible</span>
          <strong>{loyaltyVisibleCount}</strong>
          <p>Stores currently exposing loyalty in the customer app.</p>
        </article>
      </div>

      {locations.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <span className="eyebrow">No Clients Visible</span>
            <h4>Start with the first client location.</h4>
            <p>Create the client, configure the location, and set up owner access in one flow.</p>
            <Link href="/clients/new" className="primary-button">
              Create Client
            </Link>
          </div>
        </section>
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Location</th>
                <th>Market</th>
                <th>Menu</th>
                <th>Fulfillment</th>
                <th>Loyalty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.locationId}>
                  <td>
                    <strong>{location.brandName}</strong>
                    <span>{location.storeName}</span>
                  </td>
                  <td>{location.locationName}</td>
                  <td>{location.marketLabel}</td>
                  <td>{location.capabilities.menu.source === "platform_managed" ? "Platform" : "External"}</td>
                  <td>{location.capabilities.operations.fulfillmentMode === "staff" ? "Staff" : "Time Based"}</td>
                  <td>{location.capabilities.loyalty.visible ? "Visible" : "Hidden"}</td>
                  <td>
                    <Link href={`/clients/${location.locationId}`} className="table-link">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
