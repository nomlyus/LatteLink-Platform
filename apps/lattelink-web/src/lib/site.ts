export const siteName = "LatteLink";
export const parentCompany = "nomly";
export const productByline = "LatteLink by nomly";
export const parentTagline =
  "nomly builds infrastructure for modern local commerce.";
export const siteUrl = "https://nomly.us";
export const privacyPolicyPath = "/privacy-policy";
export const privacyPolicyUrl = `${siteUrl}${privacyPolicyPath}`;
export const siteTitle =
  "Nomly — Create your own branded ordering app";
export const siteDescription =
  "Nomly helps independent coffee shops create, launch, and operate branded mobile ordering apps without marketplace economics.";
export const contactEmail = "hello@lattelink.app";
export const termsOfServicePath = "/terms";
export const termsOfServiceUrl = `${siteUrl}${termsOfServicePath}`;
export const demoHref = "/#contact";

const configuredDashboardUrl = process.env.NEXT_PUBLIC_CLIENT_DASHBOARD_URL?.trim();

function normalizeExternalUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")
    ? value
    : `https://${value}`;
}

function withQueryParam(url: string, key: string, value: string) {
  const parsed = new URL(url, siteUrl);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

export const merchantDashboardUrl = configuredDashboardUrl ? normalizeExternalUrl(configuredDashboardUrl) : "https://app.nomly.us";
export const merchantStartHref = withQueryParam(merchantDashboardUrl, "intent", "launch");
