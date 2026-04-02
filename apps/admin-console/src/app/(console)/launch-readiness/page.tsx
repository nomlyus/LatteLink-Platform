import Link from "next/link";
import { getInternalLocationOwner, listInternalLocations } from "@/lib/internal-api";

export default async function LaunchReadinessPage() {
  const locations = (await listInternalLocations()).locations;
  const readinessRows = await Promise.all(
    locations.map(async (location) => ({
      location,
      owner: await getInternalLocationOwner(location.locationId).catch(() => ({ locationId: location.locationId, owner: null }))
    }))
  );

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Launch Readiness</span>
          <h3>Client launch status</h3>
          <p>Use this view to spot missing owner access or disabled launch-critical capabilities before handoff.</p>
        </div>
      </div>

      <section className="panel">
        {readinessRows.length === 0 ? (
          <div className="empty-state">
            <h4>No launch records yet.</h4>
            <p>Create a client before using the readiness board.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Owner</th>
                <th>Dashboard</th>
                <th>Tracking</th>
                <th>Loyalty</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {readinessRows.map(({ location, owner }) => (
                <tr key={location.locationId}>
                  <td>
                    <strong>{location.brandName}</strong>
                    <span>{location.locationName}</span>
                  </td>
                  <td>{owner.owner ? owner.owner.email : "Missing owner"}</td>
                  <td>{location.capabilities.operations.dashboardEnabled ? "Enabled" : "Disabled"}</td>
                  <td>{location.capabilities.operations.liveOrderTrackingEnabled ? "Enabled" : "Disabled"}</td>
                  <td>{location.capabilities.loyalty.visible ? "Visible" : "Hidden"}</td>
                  <td>
                    <Link href={`/clients/${location.locationId}`} className="table-link">
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
