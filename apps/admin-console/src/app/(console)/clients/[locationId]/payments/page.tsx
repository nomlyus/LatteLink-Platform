import Link from "next/link";
import { notFound } from "next/navigation";
import { refreshStripeStatusAction } from "@/app/actions";
import { getInternalLocation, InternalApiError } from "@/lib/internal-api";

type ClientPaymentsPageProps = {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(query: Record<string, string | string[] | undefined>, key: string) {
  return typeof query[key] === "string" ? query[key] : undefined;
}

export default async function ClientPaymentsPage({ params, searchParams }: ClientPaymentsPageProps) {
  const { locationId } = await params;
  const query = await searchParams;
  const error = readSearchParam(query, "error");
  const stripeReturn = readSearchParam(query, "stripeReturn");
  const stripeRefresh = readSearchParam(query, "stripeRefresh");
  const stripeStatusRefresh = readSearchParam(query, "stripeStatusRefresh");

  try {
    const location = await getInternalLocation(locationId);
    const paymentProfile = location.paymentProfile;
    const paymentReadiness = location.paymentReadiness;
    const isReady = paymentReadiness?.ready ?? false;
    const onboardingState = paymentReadiness?.onboardingState ?? paymentProfile?.stripeOnboardingStatus ?? "unconfigured";
    const missingRequiredFields = paymentReadiness?.missingRequiredFields ?? ["stripeAccountId", "stripeChargesEnabled", "stripePayoutsEnabled"];
    const hasStripeAccount = Boolean(paymentProfile?.stripeAccountId);

    return (
      <section className="page-stack">
        <div className="page-header">
          <div>
            <span className="eyebrow">Payments</span>
            <h3>{location.brandName}</h3>
            <p>Manage Stripe Connect onboarding and readiness for mobile checkout at this location.</p>
          </div>
          <div className="page-tools">
            <span className={`status-badge is-${isReady ? "healthy" : onboardingState === "completed" ? "warning" : "critical"}`}>
              {isReady ? "Checkout ready" : onboardingState === "completed" ? "Needs review" : "Onboarding required"}
            </span>
            <Link href={`/clients/${locationId}`} className="secondary-button">
              Back to Client
            </Link>
          </div>
        </div>

        {stripeReturn ? (
          <p className="inline-message inline-message-success">
            Returned from Stripe. Refresh the profile below if anything still shows as pending.
          </p>
        ) : null}
        {stripeRefresh ? (
          <p className="inline-message inline-message-warning">
            Stripe asked for a refreshed onboarding link. Start onboarding again below.
          </p>
        ) : null}
        {stripeStatusRefresh ? (
          <p className="inline-message inline-message-success">
            Stripe status refreshed from the connected account.
          </p>
        ) : null}
        {error ? <p className="inline-message inline-message-error">{error}</p> : null}

        <div className="stat-grid">
          <article className="stat-card">
            <span className="eyebrow">Stripe Account</span>
            <strong>{paymentProfile?.stripeAccountId ?? "Not linked"}</strong>
            <p>{paymentProfile ? "Connected account stored for this location." : "This location still needs its first Stripe Connect account."}</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Onboarding</span>
            <strong>{onboardingState}</strong>
            <p>State is derived from the latest stored Stripe account status and capability readiness.</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Charges</span>
            <strong>{paymentProfile?.stripeChargesEnabled ? "Enabled" : "Disabled"}</strong>
            <p>Mobile checkout should stay blocked until Stripe confirms charges are enabled.</p>
          </article>
          <article className="stat-card">
            <span className="eyebrow">Payouts</span>
            <strong>{paymentProfile?.stripePayoutsEnabled ? "Enabled" : "Disabled"}</strong>
            <p>Express dashboard visibility is useful, but payout readiness still comes from Stripe account state.</p>
          </article>
        </div>

        <div className="split-layout">
          <section className="panel stack-form">
            <div className="form-card">
              <div className="section-copy">
                <span className="eyebrow">Actions</span>
                <h4>Stripe Connect access</h4>
                <p>Owners connect or continue Stripe from the client dashboard setup flow. Use this page for readiness and support checks.</p>
              </div>
              <div className="callout">
                <strong>Owner action required</strong>
                <p>Ask the owner to open Setup in the client dashboard and use the Payments step.</p>
              </div>
              <form action={refreshStripeStatusAction} className="stack-form">
                <input type="hidden" name="locationId" value={locationId} />
                <div className="form-actions">
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={!hasStripeAccount}
                    aria-disabled={!hasStripeAccount}
                  >
                    Refresh Stripe status
                  </button>
                </div>
                <p className="field-hint">Pulls the latest connected-account status from Stripe and persists the readiness profile.</p>
              </form>
            </div>

            <div className="form-card">
              <div className="section-copy">
                <span className="eyebrow">Stored profile</span>
                <h4>Current payment settings</h4>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Card enabled</dt>
                  <dd>{paymentProfile?.cardEnabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Apple Pay enabled</dt>
                  <dd>{paymentProfile?.applePayEnabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Refunds enabled</dt>
                  <dd>{paymentProfile?.refundsEnabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Clover POS operational flag</dt>
                  <dd>{paymentProfile?.cloverPosEnabled ? "Enabled" : "Disabled"}</dd>
                </div>
                <div>
                  <dt>Stripe dashboard</dt>
                  <dd>{paymentProfile?.stripeDashboardEnabled ? "Available" : "Unavailable"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <aside className="sidebar-stack sticky-sidebar">
            <section className="panel">
              <div className="section-copy">
                <span className="eyebrow">Readiness</span>
                <h4>What is still blocking checkout</h4>
              </div>
              {missingRequiredFields.length === 0 ? (
                <div className="callout is-success">
                  <strong>Stripe mobile checkout is ready.</strong>
                  <p>This location has the minimum Stripe account state needed for mobile payments.</p>
                </div>
              ) : (
                <div className="checklist">
                  {missingRequiredFields.map((field) => (
                    <div key={field} className="check-item is-blocked">
                      <strong>{field}</strong>
                      <span>Needs attention</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="section-copy">
                <span className="eyebrow">Flow</span>
                <h4>Recommended operator sequence</h4>
              </div>
              <div className="mini-list">
                <div className="mini-list-item">
                  <span className="step-item-index">1</span>
                  <div className="mini-list-copy">
                    <strong>Create or continue onboarding</strong>
                    <p>This stores the Stripe account ID on the location profile if it does not already exist.</p>
                  </div>
                </div>
                <div className="mini-list-item">
                  <span className="step-item-index">2</span>
                  <div className="mini-list-copy">
                    <strong>Complete Stripe requirements</strong>
                    <p>Stripe must enable charges and payouts before the app can create mobile payment sessions.</p>
                  </div>
                </div>
                <div className="mini-list-item">
                  <span className="step-item-index">3</span>
                  <div className="mini-list-copy">
                    <strong>Re-open this page</strong>
                    <p>Use the latest stored readiness here to confirm the location is actually ready for checkout.</p>
                  </div>
                </div>
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
