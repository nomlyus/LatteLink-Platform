import Link from "next/link";
import { expireSupportCheckoutAction } from "@/app/actions";
import {
  InternalApiError,
  listInternalLocations,
  lookupSupportCheckouts,
  lookupSupportOrders,
  type SupportCheckoutLookupResponse,
  type SupportCheckoutLookupResult,
  type SupportOrderLookupResponse,
  type SupportOrderLookupResult
} from "@/lib/internal-api";

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(amountCents / 100);
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getCustomerLabel(result: SupportOrderLookupResult) {
  return result.customer?.email ?? result.customer?.phone ?? result.customer?.name ?? result.userId ?? "Unknown customer";
}

async function safeLookupSupportOrders(input: {
  query: string;
  locationId?: string;
  limit?: number;
}): Promise<{ lookup: SupportOrderLookupResponse; error?: string }> {
  try {
    return {
      lookup: await lookupSupportOrders(input)
    };
  } catch (error) {
    if (error instanceof InternalApiError) {
      return {
        lookup: { results: [] },
        error: error.message
      };
    }

    throw error;
  }
}

async function safeLookupSupportCheckouts(input: {
  query: string;
  locationId?: string;
  limit?: number;
}): Promise<{ lookup: SupportCheckoutLookupResponse; error?: string }> {
  try {
    return {
      lookup: await lookupSupportCheckouts(input)
    };
  } catch (error) {
    if (error instanceof InternalApiError) {
      return {
        lookup: { results: [] },
        error: error.message
      };
    }

    throw error;
  }
}

function getCheckoutTone(result: SupportCheckoutLookupResult) {
  if (result.checkout.status === "OPEN") return "warning";
  if (result.checkout.status === "EXPIRED") return "critical";
  return "healthy";
}

export default async function SupportPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const query = getParam(params.query)?.trim() ?? "";
  const locationId = getParam(params.locationId)?.trim() ?? "";
  const actionError = getParam(params.error);
  const checkoutExpired = getParam(params.checkoutExpired);
  const checkoutUnchanged = getParam(params.checkoutUnchanged);
  const [{ locations }, lookupResult, checkoutLookupResult] = await Promise.all([
    listInternalLocations(),
    query.length > 0
      ? safeLookupSupportOrders({
          query,
          locationId: locationId || undefined,
          limit: 25
        })
      : Promise.resolve<{ lookup: SupportOrderLookupResponse; error?: string }>({ lookup: { results: [] } }),
    query.length > 0
      ? safeLookupSupportCheckouts({
          query,
          locationId: locationId || undefined,
          limit: 25
        })
      : Promise.resolve<{ lookup: SupportCheckoutLookupResponse; error?: string }>({ lookup: { results: [] } })
  ]);
  const lookup = lookupResult.lookup;
  const checkoutLookup = checkoutLookupResult.lookup;
  const totalResults = lookup.results.length + checkoutLookup.results.length;

  return (
    <section className="page-stack">
      <div className="page-header">
        <div>
          <span className="eyebrow">Support</span>
          <h3>Order lookup</h3>
          <p>Search by phone number, customer name/email, pickup code, order ID, payment ID, or Stripe PaymentIntent.</p>
        </div>
        <div className="page-tools">
          <Link href="/dashboard" className="secondary-button">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <section className="panel">
        <form className="form-grid" action="/support">
          <label>
            <span>Lookup query</span>
            <input name="query" placeholder="Phone, name, email, pickup code, order ID, or payment ID" defaultValue={query} required />
          </label>
          <label>
            <span>Location filter</span>
            <select name="locationId" defaultValue={locationId}>
              <option value="">All locations</option>
              {locations.map((location) => (
                <option key={location.locationId} value={location.locationId}>
                  {location.brandName} · {location.locationName}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Search Orders
            </button>
          </div>
        </form>
      </section>

      <section className="panel table-panel">
        {actionError ? (
          <div className="empty-state is-critical">
            <h4>Support action failed.</h4>
            <p>{actionError}</p>
          </div>
        ) : checkoutExpired ? (
          <div className="empty-state is-success">
            <h4>Checkout expired.</h4>
            <p>{checkoutExpired} was closed and any reserved discount was released.</p>
          </div>
        ) : checkoutUnchanged ? (
          <div className="empty-state">
            <h4>Checkout was already settled.</h4>
            <p>{checkoutUnchanged} did not need a recovery action.</p>
          </div>
        ) : null}

        <div className="section-heading">
          <div>
            <span className="eyebrow">Results</span>
            <h4>{query ? `${totalResults} result${totalResults === 1 ? "" : "s"}` : "Search required"}</h4>
          </div>
        </div>

        {lookupResult.error || checkoutLookupResult.error ? (
          <div className="empty-state">
            <h4>Support lookup failed.</h4>
            <p>{lookupResult.error ?? checkoutLookupResult.error}</p>
            <p>Check Sentry and retry after the backend issue is resolved.</p>
          </div>
        ) : !query ? (
          <div className="empty-state">
            <h4>Enter a lookup query.</h4>
            <p>Use this before querying the database manually during pilot support.</p>
          </div>
        ) : totalResults === 0 ? (
          <div className="empty-state">
            <h4>No matching records found.</h4>
            <p>Try removing the location filter or searching by phone, email, pickup code, order ID, checkout ID, or payment ID.</p>
          </div>
        ) : (
          <div className="support-results">
            {checkoutLookup.results.map((result) => (
              <article key={result.checkout.checkoutId} className="support-order-card">
                <div className="support-order-card__header">
                  <div>
                    <span className="eyebrow">{result.checkout.locationId} · checkout attempt</span>
                    <h4>{result.checkout.checkoutId}</h4>
                    <p className="subtle-copy">{result.userId ?? "Unknown customer"}</p>
                  </div>
                  <div className={`status-badge is-${getCheckoutTone(result)}`}>
                    {result.checkout.status}
                  </div>
                </div>

                <dl className="detail-grid">
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMoney(result.checkout.total.amountCents, result.checkout.total.currency)}</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>{result.paymentProvider ?? "Unknown"} {result.paymentStatus ? `· ${result.paymentStatus}` : ""}</dd>
                  </div>
                  <div>
                    <dt>PaymentIntent</dt>
                    <dd>{result.paymentIntentId ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatDate(result.checkout.expiresAt)}</dd>
                  </div>
                </dl>

                {result.checkout.status === "OPEN" ? (
                  <form action={expireSupportCheckoutAction} className="form-actions">
                    <input type="hidden" name="checkoutId" value={result.checkout.checkoutId} />
                    <input type="hidden" name="query" value={query} />
                    <input type="hidden" name="locationId" value={locationId} />
                    <button type="submit" className="secondary-button">
                      Expire checkout
                    </button>
                  </form>
                ) : null}

                <div className="audit-log">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Audit Trail</span>
                      <h4>{result.auditLog.length} event{result.auditLog.length === 1 ? "" : "s"}</h4>
                    </div>
                  </div>
                  {result.auditLog.length === 0 ? (
                    <p className="subtle-copy">No audit events recorded for this checkout yet.</p>
                  ) : (
                    result.auditLog.map((entry) => (
                      <div key={entry.logId} className="audit-log__entry">
                        <div>
                          <strong>{entry.action}</strong>
                          <span>{entry.actorType} · {entry.actorId}</span>
                        </div>
                        <time>{formatDate(entry.occurredAt)}</time>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}

            {lookup.results.map((result) => (
              <article key={result.order.id} className="support-order-card">
                <div className="support-order-card__header">
                  <div>
                    <span className="eyebrow">{result.order.locationId}</span>
                    <h4>{result.order.id}</h4>
                    <p className="subtle-copy">{getCustomerLabel(result)}</p>
                  </div>
                  <div className={`status-badge is-${result.order.status === "CANCELED" ? "critical" : "healthy"}`}>
                    {result.order.status}
                  </div>
                </div>

                <dl className="detail-grid">
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMoney(result.order.total.amountCents, result.order.total.currency)}</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>{result.paymentProvider ?? "Unknown"} {result.paymentStatus ? `· ${result.paymentStatus}` : ""}</dd>
                  </div>
                  <div>
                    <dt>Payment ID</dt>
                    <dd>{result.paymentIntentId ?? result.paymentId ?? "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{formatDate(result.createdAt)}</dd>
                  </div>
                </dl>

                <div className="audit-log">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Audit Trail</span>
                      <h4>{result.auditLog.length} event{result.auditLog.length === 1 ? "" : "s"}</h4>
                    </div>
                  </div>
                  {result.auditLog.length === 0 ? (
                    <p className="subtle-copy">No audit events recorded for this order yet.</p>
                  ) : (
                    result.auditLog.map((entry) => (
                      <div key={entry.logId} className="audit-log__entry">
                        <div>
                          <strong>{entry.action}</strong>
                          <span>{entry.actorType} · {entry.actorId}</span>
                        </div>
                        <time>{formatDate(entry.occurredAt)}</time>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
