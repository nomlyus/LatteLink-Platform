import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalLocation, getInternalLocationOwner, InternalApiError } from "@/lib/internal-api";

type ClientDetailPageProps = {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const { locationId } = await params;
  const query = await searchParams;
  const created = typeof query.created === "string" ? query.created : undefined;

  try {
    const [location, ownerSummary] = await Promise.all([
      getInternalLocation(locationId),
      getInternalLocationOwner(locationId)
    ]);

    const readiness = [
      { label: "Location configured", ready: true },
      { label: "Client dashboard enabled", ready: location.capabilities.operations.dashboardEnabled },
      { label: "Owner access configured", ready: Boolean(ownerSummary.owner) },
      { label: "Live order tracking configured", ready: location.capabilities.operations.liveOrderTrackingEnabled }
    ];

    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <span className="eyebrow">{location.marketLabel}</span>
            <h3>{location.brandName}</h3>
            <p>{location.locationName}</p>
          </div>
          <div className="button-row">
            <Link href={`/clients/${locationId}/capabilities`} className="secondary-button">
              Edit Capabilities
            </Link>
            <Link href={`/clients/${locationId}/owner`} className="primary-button">
              Manage Owner
            </Link>
          </div>
        </div>

        {created ? <p className="inline-message inline-message-success">Client created and owner access is ready.</p> : null}

        <div className="detail-grid">
          <section className="panel">
            <div className="section-heading">
              <span className="eyebrow">Business</span>
              <h4>Client summary</h4>
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
              <span className="eyebrow">Owner</span>
              <h4>Owner access</h4>
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
              <p className="inline-message inline-message-warning">No owner is assigned to this location yet.</p>
            )}
          </section>
        </div>

        <section className="panel">
          <div className="section-heading">
            <span className="eyebrow">Readiness</span>
            <h4>Launch checklist</h4>
          </div>
          <div className="checklist">
            {readiness.map((item) => (
              <div key={item.label} className={item.ready ? "check-item is-ready" : "check-item is-blocked"}>
                <strong>{item.label}</strong>
                <span>{item.ready ? "Ready" : "Needs attention"}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    );
  } catch (error) {
    if (error instanceof InternalApiError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}
